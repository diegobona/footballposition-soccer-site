import { onRequestPost as __api_upload_image_js_onRequestPost } from "D:\\Asideproject\\! 网站、插件、APP\\footballposition.soccer\\footballposition-soccer\\functions\\api\\upload-image.js"
import { onRequestGet as __oauth_callback_js_onRequestGet } from "D:\\Asideproject\\! 网站、插件、APP\\footballposition.soccer\\footballposition-soccer\\functions\\oauth\\callback.js"
import { onRequestGet as __oauth_js_onRequestGet } from "D:\\Asideproject\\! 网站、插件、APP\\footballposition.soccer\\footballposition-soccer\\functions\\oauth.js"

export const routes = [
    {
      routePath: "/api/upload-image",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_upload_image_js_onRequestPost],
    },
  {
      routePath: "/oauth/callback",
      mountPath: "/oauth",
      method: "GET",
      middlewares: [],
      modules: [__oauth_callback_js_onRequestGet],
    },
  {
      routePath: "/oauth",
      mountPath: "/",
      method: "GET",
      middlewares: [],
      modules: [__oauth_js_onRequestGet],
    },
  ]