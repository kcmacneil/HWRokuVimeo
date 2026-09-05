' Shared helpers available to all components (source/ is global scope).

function FormatDuration(seconds as dynamic) as string
    if seconds = invalid then return ""
    total = Int(seconds)
    if total <= 0 then return ""
    h = Int(total / 3600)
    m = Int((total mod 3600) / 60)
    s = total mod 60
    if h > 0 then
        return h.toStr() + ":" + PadTwo(m) + ":" + PadTwo(s)
    end if
    return m.toStr() + ":" + PadTwo(s)
end function

function PadTwo(n as integer) as string
    if n < 10 then return "0" + n.toStr()
    return n.toStr()
end function

' "2024-01-02T03:04:05+00:00" -> "Jan 2, 2024"
function FormatDate(iso as dynamic) as string
    if iso = invalid or Len(iso) < 10 then return ""
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    y = Mid(iso, 1, 4)
    m = Val(Mid(iso, 6, 2))
    d = Val(Mid(iso, 9, 2))
    if m < 1 or m > 12 then return ""
    return months[m - 1] + " " + d.toStr() + ", " + y
end function

' Build a ContentNode for the grids/rows from a normalized API video object.
function VideoToContentNode(v as object) as object
    node = CreateObject("roSGNode", "ContentNode")
    node.id = v.id
    node.title = v.title
    node.description = v.description
    if v.duration <> invalid then node.length = Int(v.duration)
    if v.thumbnail <> invalid then
        node.hdPosterUrl = v.thumbnail
        node.sdPosterUrl = v.thumbnail
    end if
    if v.thumbnailLarge <> invalid then node.fhdPosterUrl = v.thumbnailLarge
    if v.releaseDate <> invalid then node.releaseDate = FormatDate(v.releaseDate)
    if v.createdAt <> invalid then node.addFields({ createdAt: v.createdAt })
    if v.category <> invalid then node.categories = [v.category]
    node.shortDescriptionLine1 = v.title
    node.shortDescriptionLine2 = FormatDuration(v.duration)
    return node
end function

' Map backend error codes to friendly on-screen text.
function FriendlyError(code as dynamic, fallback = "Something went wrong. Please try again." as string) as string
    if code = invalid then return fallback
    if code = "NETWORK" then return "Can't reach the video service. Check your internet connection and try again."
    if code = "TIMEOUT" then return "The video service is taking too long to respond. Please try again."
    if code = "NOT_CONFIGURED" then return "The video service hasn't been set up yet."
    if code = "UNAUTHORIZED" then return "This channel isn't authorized to use the video service."
    if code = "VIMEO_AUTH_FAILED" then return "The video service couldn't sign in to Vimeo."
    if code = "VIMEO_RATE_LIMITED" then return "The video service is busy. Please try again in a moment."
    if code = "VIMEO_UNAVAILABLE" then return "Vimeo is temporarily unavailable. Please try again later."
    if code = "VIDEO_UNAVAILABLE" then return "This video is no longer available."
    if code = "VIDEO_RESTRICTED" then return "This video is private or restricted."
    if code = "NO_STREAM" then return "This video can't be streamed right now."
    if code = "NOT_FOUND" then return "That content couldn't be found."
    return fallback
end function

sub LogMsg(msg as string, data = invalid as dynamic)
    line = "[HWVimeo] " + msg
    if data <> invalid then line = line + " " + FormatJson(data)
    print line
end sub
