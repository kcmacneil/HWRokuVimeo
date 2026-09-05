sub init()
    m.buttons = m.top.findNode("buttons")
    m.buttons.buttons = ["Play"]
    m.buttons.observeField("buttonSelected", "onButtonSelected")
    m.top.observeField("visible", "onVisible")
end sub

sub onVisible()
    if m.top.visible then m.buttons.setFocus(true)
end sub

sub onContentChanged()
    item = m.top.content
    if item = invalid then return
    m.top.findNode("title").text = item.title
    m.top.findNode("description").text = item.description

    meta = []
    d = FormatDuration(item.length)
    if d <> "" then meta.push(d)
    if item.releaseDate <> "" then meta.push(item.releaseDate)
    m.top.findNode("meta").text = Join(meta, "   •   ")

    cats = item.categories
    if cats <> invalid and cats.count() > 0 then
        m.top.findNode("category").text = cats[0]
    else
        m.top.findNode("category").text = ""
    end if

    art = item.fhdPosterUrl
    if art = "" then art = item.hdPosterUrl
    m.top.findNode("artwork").uri = art
    m.top.findNode("backdrop").uri = art
    m.buttons.setFocus(true)
end sub

sub onButtonSelected()
    if m.buttons.buttonSelected = 0 then m.top.playRequested = true
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if press and key = "play" then
        m.top.playRequested = true
        return true
    end if
    return false
end function

function Join(parts as object, sep as string) as string
    out = ""
    for i = 0 to parts.count() - 1
        if i > 0 then out = out + sep
        out = out + parts[i]
    end for
    return out
end function
