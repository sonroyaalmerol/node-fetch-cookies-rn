const _fetch = require("node-fetch");
const CookieJar = require("./cookie-jar.js");
const Cookie = require("./cookie.js");
const { paramError, CookieParseError } = require("./errors.js");

const fetch = async (cookieJars, url, options) => {
    const fetchCookie = async (cookieJars, url, options) => {
        let cookies = "";
        const addValidFromJars = jars => {
            // since multiple cookie jars can be passed, filter duplicates by using a set of cookie names
            const set = new Set();
            jars.flatMap(jar => [...jar.cookiesValidForRequest(url)])
                .forEach(cookie => {
                    if(set.has(cookie.name))
                        return;
                    set.add(cookie.name);
                    cookies += cookie.serialize() + "; ";
                });
        };
        if(cookieJars) {
            if(Array.isArray(cookieJars) && cookieJars.every(c => c instanceof CookieJar))
                addValidFromJars(cookieJars.filter(jar => jar.flags.includes("r")));
            else if(cookieJars instanceof CookieJar)
                if(cookieJars.flags.includes("r"))
                    addValidFromJars([cookieJars]);
            else
                throw paramError("First", "cookieJars", "fetch", ["CookieJar", "[CookieJar]"]);
        }
        if(cookies) {
            if(!options)
                options = {};
            if(!options.headers)
                options.headers = {};
            options.headers.cookie = cookies.slice(0, -2);
        }
        const result = await _fetch(url, options);
        // I cannot use headers.get() here because it joins the cookies to a string
        cookies = result.headers[Object.getOwnPropertySymbols(result.headers)[0]]["set-cookie"];
        if(cookies && cookieJars) {
            if(Array.isArray(cookieJars)) {
                cookieJars
                    .filter(jar => jar.flags.includes("w"))
                    .forEach(jar => cookies.forEach(c => jar.addCookie(c, url)));
            }
            else if(cookieJars instanceof CookieJar && cookieJars.flags.includes("w"))
                cookies.forEach(c => cookieJars.addCookie(c, url));
        }
        return result;
    }

    const opts = Object.assign({}, options, { redirect: 'manual' })

    // Forward identical options to wrapped node-fetch but tell to not handle redirection.
    return fetchCookie(cookieJars, url, opts)
      .then(res => {
        const isRedirect = (res.status === 303 || ((res.status === 301 || res.status === 302)))

        // Interpret the proprietary "redirect" option in the same way that node-fetch does.
        if (isRedirect && userOptions.redirect !== 'manual' && userOptions.follow !== 0) {
          const optsForGet = Object.assign({}, {
            method: 'GET',
            body: null,
            // Since the "follow" flag is not relevant for node-fetch in this case,
            // we'll hijack it for our internal bookkeeping.
            follow: userOptions.follow !== undefined ? userOptions.follow - 1 : undefined
          })

          return fetch(cookieJars, res.headers.get('location'), optsForGet)
        } else {
          return res
        }
      })
}

module.exports = {fetch, CookieJar, Cookie, CookieParseError};
