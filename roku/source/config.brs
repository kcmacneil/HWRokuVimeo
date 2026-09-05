' Single place to configure the middleware the channel talks to.
' Change API_BASE_URL to your deployed backend (no trailing slash).
function AppConfig() as object
    return {
        API_BASE_URL: "https://hw-roku-vimeo-api.vercel.app/api"
        ' Optional shared secret; must match API_KEY on the backend. Leave "" to disable.
        API_KEY: ""
        ' Videos requested per page from the middleware.
        PAGE_SIZE: 40
        ' When a video ends, play the next one in the same row/collection after a countdown.
        ' Set AUTOPLAY_NEXT to false to disable, or the countdown to 0 to start immediately.
        AUTOPLAY_NEXT: true
        AUTOPLAY_COUNTDOWN_SECONDS: 10
        ' Network timeout for API calls (ms).
        REQUEST_TIMEOUT_MS: 15000
        ' How many rows of "recent" videos the home screen shows before categories.
        HOME_ROW_SIZE: 20
    }
end function
