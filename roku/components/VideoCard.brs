sub init()
    m.poster = m.top.findNode("poster")
    m.frame = m.top.findNode("frame")
    m.focusRing = m.top.findNode("focusRing")
    m.title = m.top.findNode("title")
    m.duration = m.top.findNode("duration")
    m.durationBg = m.top.findNode("durationBg")
end sub

sub onSizeChanged()
    w = m.top.width
    posterH = Int(w * 9 / 16)
    m.frame.width = w
    m.frame.height = posterH
    m.poster.width = w
    m.poster.height = posterH
    m.focusRing.width = w + 12
    m.focusRing.height = posterH + 12
    m.title.width = w
    m.title.translation = [0, posterH + 10]
    m.durationBg.translation = [w - 84, posterH - 38]
end sub

sub onContentChanged()
    item = m.top.itemContent
    if item = invalid then return
    m.title.text = item.title
    m.poster.uri = item.hdPosterUrl
    d = FormatDuration(item.length)
    if item.isCategory = true then d = item.shortDescriptionLine2
    m.duration.text = d
    m.durationBg.visible = d <> ""
end sub

sub onFocusChanged()
    p = m.top.focusPercent
    m.focusRing.opacity = p
    if p > 0.5 then
        m.title.color = "#FFFFFF"
    else
        m.title.color = "#D5DAE1"
    end if
end sub
