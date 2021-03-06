import {
  Components,
  getRawComponent,
  replaceComponent,
  withDocument,
  registerComponent,
  getActions,
  withCurrentUser,
  withMutation } from 'meteor/vulcan:core';

import withNewEvents from '../../lib/events/withNewEvents.jsx';
import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { intlShape, FormattedMessage } from 'meteor/vulcan:i18n';
import { Link, withRouter } from 'react-router'
import { LinkContainer } from 'react-router-bootstrap';
import { DropdownButton, MenuItem } from 'react-bootstrap';
import { Posts } from 'meteor/example-forum';
import moment from 'moment';
import Users from 'meteor/vulcan:users';


class PostsPage extends Component {
  renderCommentViewSelector() {

    let views = ["top", "new"];
    const query = _.clone(this.props.router.location.query);

    return (
      <DropdownButton
        bsStyle="default"
        className="views btn-secondary"
        title={this.context.intl.formatMessage({id: "posts.view"})}
        id="views-dropdown"
      >
        {views.map(view =>
          <LinkContainer key={view} to={{pathname: this.props.router.location.pathname, query: {...query, view: view}}} className="dropdown-item">
            <MenuItem>
              { /* borrow the text from post views */ }
              <FormattedMessage id={"posts."+view}/>
            </MenuItem>
          </LinkContainer>
        )}
      </DropdownButton>
    )

  }

  getView() {
    switch(this.props.router.location.query.view) {
        case 'top':
          return 'postCommentsTop';
        case 'new':
          return 'postCommentsNew';
    }

    // default to top
    return 'postCommentsTop';
  }

  getCommentCountStr = (count) => {
    if (!count) {
        return "No comments"
    } else if (count == 1) {
        return "1 comment"
    } else {
        return count + " comments"
    }
  }

  render() {
    if (this.props.loading) {

      return <div className="posts-page"><Components.Loading/></div>

    } else if (!this.props.document) {

      // console.log(`// missing post (_id: ${this.props.documentId})`);
      return <div className="posts-page"><FormattedMessage id="app.404"/></div>

    } else {
      const post = this.props.document;
      const userId = this.props.currentUser && this.props.currentUser._id;
      const htmlBody = {__html: post.htmlBody};
      const commentTerms = _.isEmpty(this.props.location && this.props.location.query) ? {view: 'postCommentsTop', limit: 50}: this.props.location.query;

      let commentHash = this.props.params.commentId;
      if (commentHash){
        commentHash = commentHash.length == 17 && commentHash;
      }
      // Check for "context" as last part of the hash and ignore it if it exists
      // TODO: Make this less ugly
      if (commentHash && commentHash.substring(commentHash.length - 7, commentHash.length) === "context") {
        commentHash = commentHash.slice(0,-7);
      }

      const sequenceId = this.props.params.sequenceId;

      return (
        <div className="posts-page">
          <Components.HeadTags url={Posts.getPageUrl(post)} title={post.title} image={post.thumbnailUrl} description={post.excerpt} />
          {commentHash ? <div className="posts-comments-thread-linked-comment">
            <Components.CommentWithContextWrapper documentId={commentHash} />
          </div> : null}
          <div className="posts-page-content">
            <div className="posts-page-content-header">
              <div className="posts-page-content-header-title">
                <h1>{post.title}</h1>
              </div>
              {sequenceId ? <Components.SequencesNavigation documentId={sequenceId} post={post} /> : null}
              <div className="posts-page-content-header-voting">
                <Components.Vote collection={Posts} document={post} currentUser={this.props.currentUser}/>
              </div>
              <div className="posts-page-content-header-author">
                <Components.UsersName user={post.user} />
              </div>
            </div>
            <div className="posts-page-content-body">
              <div className="posts-page-content-body-metadata">
                <div className="posts-page-content-body-metadata-date">
                  {moment(post.postedAt).format('MMM D, YYYY')}
                </div>
                <div className="posts-page-content-body-metadata-comments">
                  <a href="#comments">{ this.getCommentCountStr(post.commentCount) }</a>
                </div>
                <div className="posts-page-content-body-metadata-actions">
                  {Posts.options.mutations.edit.check(this.props.currentUser, post) ?
                    <div className="posts-page-content-body-metadata-action">
                      <Link to={{pathname:'/editPost', query:{postId: post._id}}}>
                        Edit
                      </Link>
                    </div> : null
                  }
                  {Users.canDo(this.props.currentUser, "posts.edit.all") ?
                    <div className="posts-page-content-body-metadata-action">
                      <Components.DialogGroup title="Stats" trigger={<Link>Stats</Link>}>
                        <Components.PostVotesInfo documentId={ post._id } />
                      </Components.DialogGroup>
                    </div> : null
                  }
                </div>
              </div>
              {post.htmlBody && <div className="posts-page-content-body-html content-body" dangerouslySetInnerHTML={htmlBody}></div>}
              {/* {post.content ? <div className="posts-page-content-body-ory content-body"> <Components.ContentRenderer state={post.content} /> </div> : null} Commented out for performance reasons */}
              {post.categories && post.categories.length > 0 ? <div className="posts-page-content-body-tags">
                Tags: <span className="posts-page-content-body-tags-list"> {post.categories.map(category => <a href={"/categories/"+category.id +"/"+category.slug}>{category.name}</a>)} </span>
              </div> : null}
            </div>
            <div className="posts-page-content-footer">
              <div className="posts-page-content-footer-voting">
                <Components.Vote collection={Posts} document={post} currentUser={this.props.currentUser}/>
              </div>
              <div className="posts-page-content-footer-author">
                <Components.UsersName user={post.user} />
              </div>
            </div>
          </div>
          {this.renderRecommendedReading()}
          <div className="posts-page-comments" id="comments">
            <Components.PostsCommentsThreadWrapper terms={{...commentTerms, postId: post._id}} userId={userId} />
          </div>
        </div>
      );
    }
  }

  renderRecommendedReading = () => {
    const post = this.props.document;
    const sequenceId = this.props.params.sequenceId;
    if (post.nextPageTitle && sequenceId) {
      return <div className="posts-page-recommended-reading">
        <Components.RecommendedReadingWrapper documentId={sequenceId} post={post} nextTitle={post.nextPageTitle} nextLink={post.nextPageLink} collectionTitle={post.collectionTitle}/>
      </div>
    } else if (post.nextPageTitle) {
      return <div className="posts-page-recommended-reading">
        <Components.RecommendedReading post={post} nextTitle={post.nextPageTitle} nextLink={post.nextPageLink} collectionTitle={post.collectionTitle} />
      </div>
    } else if (sequenceId) {
      return <div className="posts-page-recommended-reading">
        <Components.RecommendedReadingWrapper documentId={sequenceId} post={post}/>
      </div>
    } else {
      return null
    }
  }

  async componentDidMount() {
    try {

      // destructure the relevant props
      const {
        // from the parent component, used in withDocument, GraphQL HOC
        documentId,
        // from connect, Redux HOC
        setViewed,
        postsViewed,
        // from withMutation, GraphQL HOC
        increasePostViewCount,
      } = this.props;

      // a post id has been found & it's has not been seen yet on this client session
      if (documentId && !postsViewed.includes(documentId)) {

        // trigger the asynchronous mutation with postId as an argument
        await increasePostViewCount({postId: documentId});

        // once the mutation is done, update the redux store
        setViewed(documentId);
      }

      //LESSWRONG: register page-visit event
      if(this.props.currentUser) {
        const registerEvent = this.props.registerEvent;
        const currentUser = this.props.currentUser;
        const eventProperties = {
          userId: currentUser._id,
          important: false,
          intercom: true,
        };

        if(this.props.document) {
          const post = this.props.document;
          eventProperties.documentId = post._id;
          eventProperties.postTitle = post.title;
        }
        // console.log("Registered event: ", eventProperties);
        registerEvent('post-view', eventProperties);
      }



    } catch(error) {
      console.log(error); // eslint-disable-line
    }
  }
}
PostsPage.displayName = "PostsPage";

PostsPage.propTypes = {
  documentId: PropTypes.string,
  document: PropTypes.object,
  postsViewed: PropTypes.array,
  setViewed: PropTypes.func,
  increasePostViewCount: PropTypes.func,
}

const queryOptions = {
  collection: Posts,
  queryName: 'postsSingleQuery',
  fragmentName: 'LWPostsPage',
  totalResolver: false,
};

const mutationOptions = {
  name: 'increasePostViewCount',
  args: {postId: 'String'},
};

const mapStateToProps = state => ({ postsViewed: state.postsViewed });
const mapDispatchToProps = dispatch => bindActionCreators(getActions().postsViewed, dispatch);

registerComponent(
  // component name used by Vulcan
  'PostsPage',
  // React component
  PostsPage,
  // HOC to give access to the current user
  withCurrentUser,
  // HOC to give access to LW2 event API
  withNewEvents,
  // HOC to give access to router and params
  withRouter,
  // HOC to load the data of the document, based on queryOptions & a documentId props
  [withDocument, queryOptions],
  // HOC to provide a single mutation, based on mutationOptions
  withMutation(mutationOptions),
  // HOC to give access to the redux store & related actions
  connect(mapStateToProps, mapDispatchToProps),
);
