sub init()
    m.grid = m.top.findNode("grid")
    m.header = m.top.findNode("header")
    m.count = m.top.findNode("count")
    m.status = m.top.findNode("status")
    m.content = CreateObject("roSGNode", "ContentNode")
    m.grid.content = m.content
    m.grid.observeField("itemSelected", "onItemSelected")
    m.grid.observeField("itemFocused", "onItemFocused")
    m.nextPage = invalid
    m.total = 0
    m.top.observeField("visible", "onVisible")
end sub

sub onVisible()
    if m.top.visible then m.grid.setFocus(true)
end sub

sub onTitleChanged()
    m.header.text = m.top.title
end sub

sub onLoadingChanged()
    if m.top.loading then
        if m.content.getChildCount() > 0 then m.status.text = "Loading more…"
    else if m.status.text = "Loading more…" then
        m.status.text = ""
    end if
end sub

sub onStatusChanged()
    m.status.text = m.top.statusText
end sub

' page = normalized /api/videos response
function appendPage(page as object) as boolean
    nodes = []
    for each v in page.videos
        nodes.push(VideoToContentNode(v))
    end for
    m.content.appendChildren(nodes)
    m.top.itemCount = m.content.getChildCount()
    m.total = page.total
    if page.hasMore = true then
        m.nextPage = page.nextPage
    else
        m.nextPage = invalid
    end if
    updateCount()
    if m.top.itemCount = 0 then
        m.status.text = "No videos in this collection."
    else
        m.status.text = ""
        m.grid.setFocus(true)
    end if
    return true
end function

sub updateCount()
    loaded = m.content.getChildCount()
    if m.total > loaded then
        m.count.text = loaded.toStr() + " of " + m.total.toStr() + " videos"
    else
        m.count.text = loaded.toStr() + " videos"
    end if
end sub

sub onItemSelected(event as object)
    item = m.content.getChild(event.getData())
    if item <> invalid then m.top.selectedVideo = item
end sub

' Prefetch the next page when the focus reaches the last two rows.
sub onItemFocused(event as object)
    if m.nextPage = invalid or m.top.loading then return
    idx = event.getData()
    remaining = m.content.getChildCount() - idx
    if remaining <= m.grid.numColumns * 2 then
        m.top.requestPage = m.nextPage
    end if
end sub
