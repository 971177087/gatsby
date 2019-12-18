import { apiRunner, apiRunnerAsync } from "./api-runner-browser"
import React from "react"
import ReactDOM from "react-dom"
import { Router, navigate, Location, BaseContext } from "@reach/router"
import { ScrollContext } from "gatsby-react-router-scroll"
import domReady from "@mikaelkristiansson/domready"
import {
  shouldUpdateScroll,
  init as navigationInit,
  RouteUpdates,
} from "./navigation"
import emitter from "./emitter"
import PageRenderer from "./page-renderer"
import asyncRequires from "./async-requires"
import { setLoader, ProdLoader, publicLoader } from "./loader"
import EnsureResources from "./ensure-resources"
import stripPrefix from "./strip-prefix"

// Generated during bootstrap
import matchPaths from "./match-paths.json"

const loader = new ProdLoader(asyncRequires, matchPaths)
setLoader(loader)
loader.setApiRunner(apiRunner)

window.asyncRequires = asyncRequires
window.___emitter = emitter
window.___loader = publicLoader

navigationInit()

apiRunnerAsync(`onClientEntry`).then(() => {
  console.log(`HELLO`)
  // Let plugins register a service worker. The plugin just needs
  // to return true.
  if (apiRunner(`registerServiceWorker`).length > 0) {
    require(`./register-service-worker`)
  }

  // In gatsby v2 if Router is used in page using matchPaths
  // paths need to contain full path.
  // For example:
  //   - page have `/app/*` matchPath
  //   - inside template user needs to use `/app/xyz` as path
  // Resetting `basepath`/`baseuri` keeps current behaviour
  // to not introduce breaking change.
  // Remove this in v3
  const RouteHandler = props => (
    <BaseContext.Provider
      value={{
        baseuri: `/`,
        basepath: `/`,
      }}
    >
      <PageRenderer {...props} />
    </BaseContext.Provider>
  )

  class LocationHandler extends React.Component {
    render() {
      const { location } = this.props
      return (
        <EnsureResources location={location}>
          {({ pageResources, location }) => (
            <RouteUpdates location={location}>
              <ScrollContext
                location={location}
                shouldUpdateScroll={shouldUpdateScroll}
              >
                <Router
                  basepath={__BASE_PATH__}
                  location={location}
                  id="gatsby-focus-wrapper"
                >
                  <RouteHandler
                    path={encodeURI(
                      pageResources.page.path === `/404.html`
                        ? stripPrefix(location.pathname, __BASE_PATH__)
                        : pageResources.page.matchPath ||
                            pageResources.page.path
                    )}
                    {...this.props}
                    location={location}
                    pageResources={pageResources}
                    {...pageResources.json}
                  />
                </Router>
              </ScrollContext>
              <RouteAnnouncer location={location} />
            </RouteUpdates>
          )}
        </EnsureResources>
      )
    }
  }

  class RouteAnnouncer extends React.Component {
    constructor(props) {
      super(props)
      this.state = { announcement: `` }
      console.log(`constructor`)
    }

    componentDidUpdate(prevProps) {
      console.log(`did update`, this.props.location.pathname)
      if (this.props.location.pathname !== prevProps.location.pathname) {
        requestAnimationFrame(() => {
          console.log(`updating`, this.props.location.pathname)
          let pageName = `new page at ${this.props.location.pathname}`
          if (document.title) {
            pageName = document.title
          }
          const pageHeadings = document
            .getElementById(`gatsby-focus-wrapper`)
            .getElementsByTagName(`h1`)
          if (pageHeadings) {
            pageName = pageHeadings[0].textContent
          }
          let newAnnouncement = `Navigated to ${pageName}`
          if (this.state.announcement !== newAnnouncement) {
            console.log(
              `setting state`,
              this.state.announcement,
              newAnnouncement
            )
            this.setState({
              announcement: newAnnouncement,
            })
          }
        })
      }
    }

    render() {
      console.log(`rendering`, this.props.location.pathname)
      const { announcement } = this.state
      return (
        <div
          id="gatsby-announcer"
          style={{
            position: `absolute`,
            width: 1,
            height: 1,
            padding: 0,
            overflow: `hidden`,
            clip: `rect(0, 0, 0, 0)`,
            whiteSpace: `nowrap`,
            border: 0,
          }}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {announcement}
        </div>
      )
    }
  }

  const { pagePath, location: browserLoc } = window

  // Explicitly call navigate if the canonical path (window.pagePath)
  // is different to the browser path (window.location.pathname). But
  // only if NONE of the following conditions hold:
  //
  // - The url matches a client side route (page.matchPath)
  // - it's a 404 page
  // - it's the offline plugin shell (/offline-plugin-app-shell-fallback/)
  if (
    pagePath &&
    __BASE_PATH__ + pagePath !== browserLoc.pathname &&
    !(
      loader.findMatchPath(stripPrefix(browserLoc.pathname, __BASE_PATH__)) ||
      pagePath === `/404.html` ||
      pagePath.match(/^\/404\/?$/) ||
      pagePath.match(/^\/offline-plugin-app-shell-fallback\/?$/)
    )
  ) {
    navigate(__BASE_PATH__ + pagePath + browserLoc.search + browserLoc.hash, {
      replace: true,
    })
  }

  publicLoader.loadPage(browserLoc.pathname).then(page => {
    if (!page || page.status === `error`) {
      throw new Error(
        `page resources for ${browserLoc.pathname} not found. Not rendering React`
      )
    }

    window.___webpackCompilationHash = page.page.webpackCompilationHash

    const Root = () => (
      <Location>
        {locationContext => <LocationHandler {...locationContext} />}
      </Location>
    )

    const WrappedRoot = apiRunner(
      `wrapRootElement`,
      { element: <Root /> },
      <Root />,
      ({ result }) => {
        return { element: result }
      }
    ).pop()

    const NewRoot = () => WrappedRoot

    const renderer = apiRunner(
      `replaceHydrateFunction`,
      undefined,
      ReactDOM.hydrate
    )[0]

    domReady(() => {
      renderer(
        <NewRoot />,
        typeof window !== `undefined`
          ? document.getElementById(`___gatsby`)
          : void 0,
        () => {
          apiRunner(`onInitialClientRender`)
        }
      )
    })
  })
})
