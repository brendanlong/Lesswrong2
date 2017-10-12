import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { withCurrentUser, Components, replaceComponent } from 'meteor/vulcan:core';
import { withRouter } from 'react-router';
import { Link } from 'react-router';
import NoSSR from 'react-no-ssr';

import AppBar from 'material-ui/AppBar';
import Drawer from 'material-ui/Drawer';
import MenuItem from 'material-ui/MenuItem';

import ApolloClient, { createNetworkInterface, createBatchingNetworkInterface } from 'apollo-client';

const appBarStyle = {
  boxShadow: "none",
  color: "white",
  fill: "white",
}

class Header extends Component {
  constructor(props) {
    super(props);
    this.state = {
      open: false,
    };
  }

  handleToggle = () => this.setState({open: !this.state.open});

  handleClose = () => this.setState({open: false});

  renderAppBarElementRight = (textColor) => {
    const notificationTerms = {view: 'userNotifications', userId: (!!this.props.currentUser ? this.props.currentUser._id : "0")};
    return (
      <div>
        <NoSSR><Components.SearchBar color={ textColor } /></NoSSR>
        { this.props.currentUser &&
           <Components.NotificationsMenu color={ textColor }  title="Notifications" terms={notificationTerms}/> }
        { this.props.currentUser ?
          <Components.UsersMenu color={ textColor } /> :
            <Components.UsersAccountMenu color={ textColor } /> }
      </div>
    )
  }

  getSiteSection = (path) => {
    if (path.search("/users/") != -1) {
      const userName = path.split("/")[2]
      return (
        <Link className="header-site-section user" to={"/users/" + userName}>{ userName }</Link>
      )
    }
  }

  getHeaderBackgroundColor = (path) => {
    if (path.search("/users/") != -1) {
      return "#545454"
    }
    return "#eee"
  }
  getHeaderTextColor = (path) => {
    if (path.search("/users/") != -1) {
      return "#ddd"
    }
    return "#666"
  }

  render() {
    //TODO: Improve the aesthetics of the menu bar. Add something at the top to have some reasonable spacing.
    let { router } = this.props;
    const textColor = this.getHeaderTextColor(router.location.pathname)
    appBarStyle.backgroundColor = this.getHeaderBackgroundColor(router.location.pathname)
    appBarStyle.textColor = textColor

    let siteSection = this.getSiteSection(router.location.pathname)

    return (
      <div className="header-wrapper">
        <header className="header">
          <AppBar
            onLeftIconButtonTouchTap={this.handleToggle}
            iconElementRight = {this.renderAppBarElementRight(textColor)}
            style={appBarStyle}
          >
            <div className="header-title">
              <Link to="/">LESSWRONG</Link>
                { siteSection}
            </div>
          </AppBar>
        <Drawer docked={false}
                width={200}
                open={this.state.open}
                onRequestChange={(open) => this.setState({open})}
                containerClassName="menu-drawer" >

          <MenuItem onTouchTap={this.handleClose} containerElement={<Link to={"/"}/>}> HOME </MenuItem>
          <MenuItem onTouchTap={this.handleClose} containerElement={<Link to={"/sequences"}/>}> RATIONALITY: A-Z </MenuItem>
          <MenuItem onTouchTap={this.handleClose} containerElement={<Link to={"/codex"}/>}> THE CODEX </MenuItem>
          <MenuItem onTouchTap={this.handleClose} containerElement={<Link to={"/hpmor"}/>}> HPMOR </MenuItem>
          <MenuItem onTouchTap={this.handleClose} containerElement={<Link to={"/meta"}/>}> META </MenuItem>
          <MenuItem onTouchTap={this.handleClose} containerElement={<Link to={"/posts/ANDbEKqbdDuBCQAnM/about-lesswrong-2-0"}/>}> ABOUT </MenuItem>
          <MenuItem onTouchTap={this.handleClose} containerElement={<Link to={"/daily"}/>}> ALL POSTS </MenuItem>
          {/*<MenuItem containerElement={<Link to={"/library"}/>}> THE LIBRARY </MenuItem>*/}
        </Drawer>

        </header>
      </div>
    )
  }

}

Header.displayName = "Header";

Header.propTypes = {
  currentUser: PropTypes.object,
};

replaceComponent('Header', Header, withRouter);
