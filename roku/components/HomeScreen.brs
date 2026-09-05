sub init()
    m.rows = m.top.findNode("rows")
    m.hero = m.top.findNode("hero")
    m.focusTitle = m.top.findNode("focusTitle")
    m.focusMeta = m.top.findNode("focusMeta")
    m.focusDesc = m.top.findNode("focusDesc")
    m.emptyLabel = m.top.findNode("emptyLabel")
    m.rows.observeField("rowItemSelected", "onRowItemSelected")
    m.rows.observeField("rowItemFocused", "onRowItemFocused")
    m.rowIndexByCategory = {}
    m.top.observeField("visible", "onVisible")
end sub

sub onVisible()
    if m.top.visible and m.rows.content <> invalid then m.rows.setFocus(true)
end sub

' args = { videos: [...], categories: [...], hasMore: bool }
function setContent(args as object) as boolean
    root = CreateObject("roSGNode", "ContentNode")
    m.rowIndexByCategory = {}

    if args.videos = invalid or args.videos.count() = 0 then
        m.emptyLabel.visible = true
        m.rows.content = root
        return true
    end if
    m.emptyLabel.visible = false

    recent = root.createChild("ContentNode")
    recent.title = "Recently Added"
    for each v in args.videos
        recent.appendChild(VideoToContentNode(v))
    end for

    browse = root.createChild("ContentNode")
    browse.title = "Browse"
    allTile = browse.createChild("ContentNode")
    allTile.title = "All Videos"
    allTile.id = ""
    allTile.hdPosterUrl = "pkg:/images/tile_all.png"
    allTile.addFields({ isCategory: true, categoryId: "", categoryName: "All Videos" })

    if args.categories <> invalid then
        for each cat in args.categories
            tile = browse.createChild("ContentNode")
            tile.title = cat.name
            tile.id = cat.id
            if cat.thumbnail <> invalid then
                tile.hdPosterUrl = cat.thumbnail
            else
                tile.hdPosterUrl = "pkg:/images/tile_category.png"
            end if
            countText = ""
            if cat.videoCount <> invalid then countText = cat.videoCount.toStr() + " videos"
            tile.shortDescriptionLine2 = countText
            tile.addFields({ isCategory: true, categoryId: cat.id, categoryName: cat.name })

            ' Placeholder row; filled by setCategoryRow when its videos arrive.
            row = root.createChild("ContentNode")
            row.title = cat.name
            m.rowIndexByCategory[cat.id] = root.getChildCount() - 1
        end for
    end if

    m.rows.content = root
    m.rows.setFocus(true)
    updateFocusInfo(0, 0)
    return true
end function

' args = { category: {id,name}, videos: [...] }
function setCategoryRow(args as object) as boolean
    root = m.rows.content
    if root = invalid then return false
    idx = m.rowIndexByCategory[args.category.id]
    if idx = invalid then return false
    row = root.getChild(idx)
    if row = invalid then return false
    if args.videos = invalid or args.videos.count() = 0 then
        root.removeChildIndex(idx)
        m.rowIndexByCategory.delete(args.category.id)
        ' shift indices of later rows
        for each key in m.rowIndexByCategory
            if m.rowIndexByCategory[key] > idx then m.rowIndexByCategory[key] = m.rowIndexByCategory[key] - 1
        end for
        return true
    end if
    nodes = []
    for each v in args.videos
        nodes.push(VideoToContentNode(v))
    end for
    row.appendChildren(nodes)
    return true
end function

sub onRowItemSelected(event as object)
    idx = event.getData() ' [row, item]
    item = itemAt(idx[0], idx[1])
    if item = invalid then return
    if item.isCategory = true then
        m.top.selectedCategory = { id: item.categoryId, name: item.categoryName }
    else
        m.top.selectedVideo = item
    end if
end sub

sub onRowItemFocused(event as object)
    idx = event.getData()
    updateFocusInfo(idx[0], idx[1])
end sub

sub updateFocusInfo(rowIdx as integer, itemIdx as integer)
    item = itemAt(rowIdx, itemIdx)
    if item = invalid then return
    if item.isCategory = true then
        m.focusTitle.text = item.title
        m.focusMeta.text = item.shortDescriptionLine2
        m.focusDesc.text = "Browse this collection"
        m.hero.uri = ""
        return
    end if
    m.focusTitle.text = item.title
    meta = FormatDuration(item.length)
    if item.releaseDate <> "" then
        if meta <> "" then meta = meta + "   •   "
        meta = meta + item.releaseDate
    end if
    m.focusMeta.text = meta
    m.focusDesc.text = item.description
    if item.fhdPosterUrl <> "" then
        m.hero.uri = item.fhdPosterUrl
    else
        m.hero.uri = item.hdPosterUrl
    end if
end sub

function itemAt(rowIdx as integer, itemIdx as integer) as object
    root = m.rows.content
    if root = invalid then return invalid
    row = root.getChild(rowIdx)
    if row = invalid then return invalid
    return row.getChild(itemIdx)
end function
