sub init()
    m.video = m.top.findNode("video")
    m.buffering = m.top.findNode("buffering")
    m.spinner = m.top.findNode("spinner")
    m.spinner.poster.uri = "pkg:/images/spinner.png"
    m.spinner.poster.width = 96
    m.spinner.poster.height = 96
    m.video.observeField("state", "onStateChanged")
    m.video.observeField("errorCode", "onErrorCode")
    m.video.observeField("position", "onPosition")
    m.top.observeField("visible", "onVisible")
    m.top.observeField("playback", "onPlaybackSet")
    m.cfg = AppConfig()
    m.upNext = m.top.findNode("upNext")
    m.upNextTimer = m.top.findNode("upNextTimer")
    m.upNextTimer.observeField("fire", "onUpNextTick")
    m.countdown = 0
    m.startedAt = invalid
    m.lastPosition = 0
end sub

sub onVisible()
    if m.top.visible then m.video.setFocus(true)
end sub

sub onPlaybackSet()
    pb = m.top.playback
    if pb = invalid or pb.streamUrl = invalid then
        fail("No stream was returned for this video.")
        return
    end if

    meta = m.top.meta
    content = CreateObject("roSGNode", "ContentNode")
    content.url = pb.streamUrl
    content.streamFormat = normalizeFormat(pb.streamFormat)
    if pb.title <> invalid then content.title = pb.title
    if meta <> invalid then
        if meta.title <> "" then content.title = meta.title
        content.description = meta.description
        content.hdPosterUrl = meta.hdPosterUrl
        if meta.length > 0 then content.length = meta.length
    end if

    ' Captions (WebVTT) – Roku only attaches them when subtitleTracks is set.
    ' Hooked up now so enabling them later is a one-line change in the backend.
    if pb.captions <> invalid and pb.captions.count() > 0 then
        tracks = []
        for each c in pb.captions
            tracks.push({ Language: c.language, Description: c.name, TrackName: c.url })
        end for
        content.subtitleTracks = tracks
    end if

    LogMsg("play", { url: pb.streamUrl, format: content.streamFormat })
    m.video.content = content
    m.video.setFocus(true)
    setBuffering(true)
    m.video.control = "play"
end sub

function normalizeFormat(fmt as dynamic) as string
    if fmt = "hls" then return "hls"
    if fmt = "dash" then return "dash"
    if fmt = "mp4" then return "mp4"
    return "hls"
end function

sub onStateChanged()
    state = m.video.state
    LogMsg("video state: " + state)
    if state = "buffering" then
        setBuffering(true)
    else if state = "playing" then
        setBuffering(false)
        if m.startedAt = invalid then m.startedAt = CreateObject("roTimespan")
    else if state = "paused" then
        setBuffering(false)
    else if state = "finished" then
        if m.cfg.AUTOPLAY_NEXT = true and m.top.nextItem <> invalid then
            showUpNext()
        else
            closePlayer()
        end if
    else if state = "error" then
        code = m.video.errorCode
        msg = m.video.errorMsg
        LogMsg("video error", { code: code, msg: msg, info: m.video.errorInfo })
        fail(describeError(code, msg))
    end if
end sub

sub onErrorCode()
    ' handled in onStateChanged (state becomes "error" together with the code)
end sub

sub onPosition()
    m.lastPosition = m.video.position
end sub

function describeError(code as dynamic, msg as dynamic) as string
    ' Roku Video error codes: -1 network, -2 connection timed out, -3 unknown/unsupported,
    ' -4 empty list, -5 media error (unsupported/DRM/corrupt), -6 DRM.
    if code = -1 or code = -2 then return "Playback stopped because of a network problem. Please check your connection and try again."
    if code = -3 or code = -5 then return "This video format isn't supported or the stream has expired. Please try again."
    if code = -6 then return "This video is protected and cannot be played."
    if msg <> invalid and msg <> "" then return "Playback failed (" + msg + ")."
    return "Playback failed. Please try again."
end function

sub setBuffering(visible as boolean)
    m.buffering.visible = visible
    if visible then
        m.spinner.control = "start"
    else
        m.spinner.control = "stop"
    end if
end sub

sub fail(message as string)
    m.video.control = "stop"
    m.top.errorMessage = message
end sub

sub closePlayer()
    m.upNextTimer.control = "stop"
    m.video.control = "stop"
    m.top.closed = true
end sub

' ---------------------------------------------------------------------------
' Autoplay next
' ---------------------------------------------------------------------------

sub showUpNext()
    nextItem = m.top.nextItem
    m.video.control = "stop"
    setBuffering(false)
    m.top.findNode("upNextTitle").text = nextItem.title
    m.top.findNode("upNextMeta").text = nextItem.shortDescriptionLine2
    poster = m.top.findNode("upNextPoster")
    if nextItem.hdPosterUrl <> "" then
        poster.uri = nextItem.hdPosterUrl
    else
        poster.uri = "pkg:/images/thumb_placeholder.png"
    end if
    m.countdown = m.cfg.AUTOPLAY_COUNTDOWN_SECONDS
    if m.countdown <= 0 then
        acceptUpNext()
        return
    end if
    updateCountdownLabel()
    m.upNext.visible = true
    m.upNext.setFocus(true)
    m.upNextTimer.control = "start"
end sub

sub onUpNextTick()
    m.countdown = m.countdown - 1
    if m.countdown <= 0 then
        acceptUpNext()
    else
        updateCountdownLabel()
    end if
end sub

sub updateCountdownLabel()
    m.top.findNode("upNextCountdown").text = "Playing in " + m.countdown.toStr() + "s"
end sub

sub acceptUpNext()
    m.upNextTimer.control = "stop"
    m.upNext.visible = false
    m.top.playNext = true
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "back" then
        closePlayer()
        return true
    end if
    if m.upNext.visible then
        if key = "OK" or key = "play" then
            acceptUpNext()
            return true
        end if
        return true ' swallow other keys while the prompt is up
    end if
    ' play/pause, rewind, fast forward and OK (trick play bar) are handled natively by the Video node.
    return false
end function
