import Notifications from '../collections/notifications/collection.js';
import Messages from '../collections/messages/collection.js';
import Conversations from '../collections/conversations/collection.js';
import Sequences from '../collections/sequences/collection.js';
import Users from 'meteor/vulcan:users';
import { Posts, Categories, Comments } from 'meteor/example-forum';
import { addCallback, newMutation, editMutation, Utils, runCallbacksAsync } from 'meteor/vulcan:core';
import { performSubscriptionAction } from '../subscriptions/mutations.js';
import htmlToText from 'html-to-text';
import ReactDOMServer from 'react-dom/server';
import { Components } from 'meteor/vulcan:core';
import React from 'react';
import { anchorate } from 'anchorate';


function updateConversationActivity (message) {
  // Update latest Activity timestamp on conversation when new message is added
  const user = Users.findOne(message.userId);
  const conversation = Conversations.findOne(message.conversationId);
  editMutation({
    collection: Conversations,
    documentId: conversation._id,
    set: {latestActivity: message.createdAt},
    currentUser: user,
    validate: false,
  });
}

addCallback("messages.new.async", updateConversationActivity);

const createNotifications = (userIds, notificationType, documentType, documentId) => {
  console.log("Notifications are being created for users: ", userIds, notificationType);
  userIds.forEach(userId => {

    let user = Users.findOne({ _id:userId });

    let notificationData = {
      userId: userId,
      documentId: documentId,
      documentType: documentType,
      message: notificationMessage(notificationType, documentType, documentId),
      type: notificationType,
      link: getLink(documentType, documentId),
    }

    newMutation({
      action: 'notifications.new',
      collection: Notifications,
      document: notificationData,
      currentUser: user,
      validate: false
    });
  });
}

const getLink = (documentType, documentId) => {
  let document = getDocument(documentType, documentId);

  switch(documentType) {
    case "post":
      return Posts.getPageUrl(document);
    case "comment":
      return Comments.getPageUrl(document);
    case "user":
      return Users.getProfileUrl(document, false);
    case "message":
      return Messages.getLink(document);
    default:
      console.error("Invalid notification type");
  }
}

const notificationMessage = (notificationType, documentType, documentId) => {
  let document = getDocument(documentType, documentId);

  switch(notificationType) {
    case "newPost":
      return Posts.getAuthorName(document) + ' has created a new post: ' + document.title;
    case "newPendingPost":
      return Posts.getAuthorName(document) + ' has a new post pending approval ' + document.title;
    case "postApproved":
      return 'Your post "' + document.title + '" has been approved';
    case "newComment":
      return Comments.getAuthorName(document) + ' left a new comment on "' + Posts.findOne(document.postId).title + '"';
    case "newReply":
      return Comments.getAuthorName(document) + ' replied to a comment on "' + Posts.findOne(document.postId).title + '"';
    case "newUser":
      return document.displayName + ' just signed up!';
    case "newMessage":
      let conversation = Conversations.findOne(document.conversationId);
      return Users.findOne(document.userId).displayName + ' sent you a new message' + (conversation.title ? (' in the conversation ' + conversation.title) : "") + '!';
    default:
      console.error("Invalid notification type");
  }
}

const getDocument = (documentType, documentId) => {
  switch(documentType) {
    case "post":
      return Posts.findOne(documentId);
    case "comment":
      return Comments.findOne(documentId);
    case "user":
      return Users.findOne(documentId);
    case "message":
      return Messages.findOne(documentId);
    default:
      console.error("Invalid documentType type");
  }
}

/**
 * @summary Add default subscribers to the new post.
 */
function PostsNewSubscriptions (post) {
  // Subscribe the post's author to comment notifications for the post
  // (if they have the proper setting turned on)
  const postAuthor = Users.findOne(post.userId);
  if (Users.getSetting(postAuthor, "auto_subscribe_to_my_posts", false)) {

    performSubscriptionAction('subscribe', Posts, post._id, postAuthor);
  }
}
addCallback("posts.new.async", PostsNewSubscriptions);

/**
 * @summary Add default subscribers to the new comment.
 */
function CommentsNewSubscriptions (comment) {
  // Subscribe the comment's author to reply notifications for the comment
  // (if they have the proper setting turned on)
  const commentAuthor = Users.findOne(comment.userId);
  if (Users.getSetting(commentAuthor, "auto_subscribe_to_my_comments", false)) {

    performSubscriptionAction('subscribe', Comments, comment._id, commentAuthor);
  }
}
addCallback("comments.new.async", CommentsNewSubscriptions);

/**
 * @summary Add notification callback when a post is approved
 */
function PostsApprovedNotification(post) {
  createNotifications([post.userId], 'postApproved', 'post', post._id);
}
addCallback("posts.approve.async", PostsApprovedNotification);

/**
 * @summary Add new post notification callback on post submit
 */
function PostsNewNotifications (post) {
  if (post.status === Posts.config.STATUS_PENDING) {
    // if post is pending, only notify admins
    let adminIds = _.pluck(Users.adminUsers({fields: {_id:1}}), '_id');

    // remove this post's author
    adminIds = _.without(adminIds, post.userId);

    createNotifications(adminIds, 'newPendingPost', 'post', post._id);
  } else {
    // add users who get notifications for all new posts
    let usersToNotify = _.pluck(Users.find({'notifications_posts': true}, {fields: {_id:1}}).fetch(), '_id');

    // add users who are subscribed to this post's author
    const postAuthor = Users.findOne(post.userId);
    if (!!postAuthor.subscribers) {
      usersToNotify = _.union(usersToNotify, postAuthor.subscribers);
    }

    // add users who are subscribed to this post's categories
    if (!!post.categories) {
      post.categories.forEach(cid => {
        let c = Categories.findOne(cid);
        if (!!c.subscribers) {
          usersToNotify = _.union(usersToNotify, c.subscribers);
        }
      });
    }

    // remove this post's author
    usersToNotify = _.without(usersToNotify, post.userId);

    createNotifications(usersToNotify, 'newPost', 'post', post._id);
  }
}
addCallback("posts.new.async", PostsNewNotifications);

// add new comment notification callback on comment submit
function CommentsNewNotifications(comment) {
  // note: dummy content has disableNotifications set to true
  if(Meteor.isServer && !comment.disableNotifications) {

    const post = Posts.findOne(comment.postId);

    // keep track of whom we've notified (so that we don't notify the same user twice for one comment,
    // if e.g. they're both the author of the post and the author of a comment being replied to)
    let notifiedUsers = [];

    // 1. Notify users who are subscribed to the parent comment
    if (!!comment.parentCommentId) {
      const parentComment = Comments.findOne(comment.parentCommentId);

      if (!!parentComment.subscribers && !!parentComment.subscribers.length) {
        // remove userIds of users that have already been notified
        // and of comment author (they could be replying in a thread they're subscribed to)
        let parentCommentSubscribersToNotify = _.difference(parentComment.subscribers, notifiedUsers, [comment.userId]);
        createNotifications(parentCommentSubscribersToNotify, 'newReply', 'comment', comment._id);
        notifiedUsers = notifiedUsers.concat(parentCommentSubscribersToNotify);
      }
    }

    // 2. Notify users who are subscribed to the post (which may or may not include the post's author)
    if (!!post.subscribers && !!post.subscribers.length) {
      // remove userIds of users that have already been notified
      // and of comment author (they could be replying in a thread they're subscribed to)
      let postSubscribersToNotify = _.difference(post.subscribers, notifiedUsers, [comment.userId]);
      createNotifications(postSubscribersToNotify, 'newComment', 'comment', comment._id);
    }
  }
}
addCallback("comments.new.async", CommentsNewNotifications);

function messageNewNotification(message) {
  if(Meteor.isServer) {
    const conversation = Conversations.findOne(message.conversationId);
    //Make sure to not notify the author of the message
    const notifees = conversation.participantIds.filter((id) => (id != message.userId));

    createNotifications(notifees, 'newMessage', 'message', message._id);
  }
}
addCallback("messages.new.async", messageNewNotification);

function postsNewHTMLBodyAndPlaintextBody(post) {
  if (post.content) {
    const html = ReactDOMServer.renderToStaticMarkup(<Components.ContentRenderer state={post.content} />);
    const plaintextBody = htmlToText.fromString(html);
    const excerpt =  plaintextBody.slice(0,140);
    Posts.update(post._id, {$set: {htmlBody: html, body: plaintextBody, excerpt: excerpt}});
  } else if (post.htmlBody) {
    const html = post.htmlBody;
    const plaintextBody = htmlToText.fromString(html);
    const excerpt = plaintextBody.slice(0,140);
    Posts.update(post._id, {$set: {body: plaintextBody, excerpt: excerpt, htmlBody: html}});
  }
}

addCallback("posts.new.async", postsNewHTMLBodyAndPlaintextBody);
addCallback("posts.edit.async", postsNewHTMLBodyAndPlaintextBody);

function commentsNewHTMLBodyAndPlaintextBody(comment) {
  if (comment.content) {
    const html = ReactDOMServer.renderToStaticMarkup(<Components.ContentRenderer state={comment.content} />);
    const plaintextBody = htmlToText.fromString(html);
    Comments.update(comment._id, {$set: {htmlBody: html, body: plaintextBody}});
  } else if (comment.htmlBody){
    const html = comment.htmlBody;
    const plaintextBody = htmlToText.fromString(html);
    Comments.update(comment._id, {$set: {body: plaintextBody}});
  }
}

addCallback("comments.new.async", commentsNewHTMLBodyAndPlaintextBody);
addCallback("comments.edit.async", commentsNewHTMLBodyAndPlaintextBody);

function sequencesNewPlaintextDescription(sequence) {
  if (sequence.description) {
    const html = ReactDOMServer.renderToStaticMarkup(<Components.ContentRenderer state={sequence.description} />);
    const plaintextBody = htmlToText.fromString(html);
    Sequences.update(sequence._id, {$set: {plaintextDescription: plaintextBody}});
  }
}

addCallback("sequences.new.async", sequencesNewPlaintextDescription);
addCallback("sequences.edit.async", sequencesNewPlaintextDescription);

function reactRouterAnchorTags(unusedItem) {
  anchorate();
  return unusedItem;
}

addCallback("router.onUpdate", reactRouterAnchorTags);

function userEditBanUserCallbacksAsync(user, oldUser) {
  if (user.banned && !oldUser.banned) {
    runCallbacksAsync('users.ban.async', user);
  }
  return user;
}
addCallback("users.edit.async", userEditBanUserCallbacksAsync);

function userEditVoteBannedCallbacksAsync(user, oldUser) {
  if (user.voteBanned && !oldUser.voteBanned) {
    runCallbacksAsync('users.voteBanned.async', user);
  }
  return user;
}
addCallback("users.edit.async", userEditVoteBannedCallbacksAsync);

function userEditNullifyVotesCallbacksAsync(user, oldUser) {
  if (user.nullifyVotes && !oldUser.nullifyVotes) {
    runCallbacksAsync('users.nullifyVotes.async', user);
  }
  return user;
}
addCallback("users.edit.async", userEditNullifyVotesCallbacksAsync);

const reverseVote = (vote, collection, user, multiplier) => {
  const item = collection.findOne({_id: vote.itemId});
  if (item) {
    collection.update({_id: vote.itemId}, {$set: {baseScore: (item.baseScore || 0) - (multiplier * vote.power)}})
    if (item.userId !== user._id) {
      Users.update({_id: item.userId}, {$inc: {karma: - (multiplier * vote.power)}})
    }
  } else {
    console.log("No item found corresponding to vote: ", vote);
  }
}

const nullifyVotesForUserAndCollection = (user, collection) => {
  const collectionName = Utils.capitalize(collection._name);

  if (user[`upvoted${collectionName}`] && user[`upvoted${collectionName}`].length){
    let voteArray = [];
    user[`upvoted${collectionName}`].forEach((vote) => {
      const newVote = { ...vote, nullified: true }
      voteArray.push(newVote)
      reverseVote(vote, collection, user, 1)
    })
    Users.update({_id: user._id}, {$set: {[`upvoted${collectionName}`]: voteArray}})
    console.log("Nullified n upvotes for user X: ", voteArray.length, user.displayName)
  }

  if (user[`downvoted${collectionName}`] && user[`downvoted${collectionName}`].length){
    let voteArray = [];
    user[`downvoted${collectionName}`].forEach((vote) => {
      const newVote = { ...vote, nullified: true }
      voteArray.push(newVote)
      reverseVote(vote, collection, user, -1)
    })
    Users.update({_id: user._id}, {$set: {[`downvoted${collectionName}`]: voteArray}})
    console.log("Nullified n downvotes for user X: ", voteArray.length, user.displayName)
  }
}

const undoNullifyVotesForUserAndCollection = (user, collection) => {

  const collectionName = Utils.capitalize(collection._name);

  if (user[`upvoted${collectionName}`] && user[`upvoted${collectionName}`].length){
    let voteArray = [];
    user[`upvoted${collectionName}`].forEach((vote) => {
      const newVote = { ...vote, nullified: false }
      voteArray.push(newVote)
      reverseVote(vote, collection, user, -1)
    })
    Users.update({_id: user._id}, {$set: {[`upvoted${collectionName}`]: voteArray}})
    console.log("Denullified n upvotes for user X: ", voteArray.length, user.displayName)
  }

  if (user[`downvoted${collectionName}`] && user[`downvoted${collectionName}`].length){
    let voteArray = [];
    user[`downvoted${collectionName}`].forEach((vote) => {
      const newVote = { ...vote, nullified: false }
      voteArray.push(newVote)
      reverseVote(vote, collection, user, 1)
    })
    Users.update({_id: user._id}, {$set: {[`downvoted${collectionName}`]: voteArray}})
    console.log("Denullified n downvotes for user X: ", voteArray.length, user.displayName)
  }
}

function nullifyCommentVotes(user) {
  nullifyVotesForUserAndCollection(user, Comments);
  return user;
}

addCallback("users.nullifyVotes.async", nullifyCommentVotes)

function nullifyPostVotes(user) {
  nullifyVotesForUserAndCollection(user, Posts);
  return user;
}

addCallback("users.nullifyVotes.async", nullifyPostVotes)

function userEditUndoNullifyVotesCallbacksAsync(user, oldUser) {
  if (!user.nullifyVotes && oldUser.nullifyVotes) {
    runCallbacksAsync('users.undoNullifyVotes.async', user);
  }
  return user;
}
addCallback("users.edit.async", userEditUndoNullifyVotesCallbacksAsync);

function undoNullifyCommentVotes(user) {
  undoNullifyVotesForUserAndCollection(user, Comments);
  return user;
}

addCallback("users.undoNullifyVotes.async", undoNullifyCommentVotes)

function undoNullifyPostVotes(user) {
  undoNullifyVotesForUserAndCollection(user, Posts);
  return user;
}

addCallback("users.undoNullifyVotes.async", undoNullifyPostVotes)
