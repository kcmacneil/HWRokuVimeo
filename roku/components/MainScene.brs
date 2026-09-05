sub init()
    m.cfg = AppConfig()
    m.screens = m.top.findNode("screens")
    m.loading = m.top.findNode("loading")
    m.spinner = m.top.findNode("spinner")
    m.spinner.poster.uri = "pkg:/images/spinner.png"
    m.spinner.poster.width = 96
    m.spinner.poster.height = 96
    m.stack = []
    m.tasks = {}
    m.categories = []
    m.pendingHomeRows = []
    m.homeLoaded = false

    m.home = CreateObject("roSGNode", "HomeScreen")
    m.home.observeField("selectedVideo", "onVideoSelected")
    m.home.observeField("selectedCategory", "onCategorySelected")
    pushScreen(m.home)

    loadHome()
end sub

' ---------------------------------------------------------------------------
' Screen stack
' ---------------------------------------------------------------------------

sub pushScreen(screen as object)
    if m.stack.count() > 0 then
        top = m.stack.peek()
        top.visible = false
    end if
    m.stack.push(screen)
    m.screens.appendChild(screen)
    screen.visible = true
    screen.setFocus(true)
end sub

sub popScreen()
    if m.stack.count() <= 1 then return
    screen = m.stack.pop()
    m.screens.removeChild(screen)
    top = m.stack.peek()
    top.visible = true
    top.setFocus(true)
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "back" then
        if m.stack.count() > 1 then
            popScreen()
            return true
        end if
        return false ' at Home: let Roku exit the channel
    end if
    return false
end function

' ---------------------------------------------------------------------------
' API plumbing
' ---------------------------------------------------------------------------

' Fires one ApiTask. `tag` identifies the request in onApiResponse.
sub apiGet(path as string, query as object, tag as string, context = invalid as dynamic)
    task = CreateObject("roSGNode", "ApiTask")
    task.request = { path: path, query: query, tag: tag }
    task.observeField("response", "onApiResponse")
    m.tasks[tag] = { task: task, context: context }
    task.control = "RUN"
end sub

sub onApiResponse(event as object)
    res = event.getData()
    tag = res.tag
    entry = m.tasks[tag]
    context = invalid
    if entry <> invalid then context = entry.context
    m.tasks.delete(tag)

    if tag = "home:videos" then
        onHomeVideos(res)
    else if tag = "home:categories" then
        onHomeCategories(res)
    else if Left(tag, 9) = "home:row:" then
        onHomeRow(res, context)
    else if Left(tag, 5) = "grid:" then
        onGridPage(res, context)
    else if Left(tag, 5) = "play:" then
        onPlayback(res, context)
    end if
end sub

sub showLoading(visible as boolean, text = "Loading…" as string)
    m.top.findNode("loadingLabel").text = text
    m.loading.visible = visible
    if visible then
        m.spinner.control = "start"
    else
        m.spinner.control = "stop"
    end if
end sub

' ---------------------------------------------------------------------------
' Home
' ---------------------------------------------------------------------------

sub loadHome()
    showLoading(true, "Loading your library…")
    m.homeVideos = invalid
    m.categories = invalid
    apiGet("/videos", { page: "1", perPage: m.cfg.HOME_ROW_SIZE.toStr() }, "home:videos")
    apiGet("/categories", invalid, "home:categories")
end sub

sub onHomeVideos(res as object)
    if not res.ok then
        showLoading(false)
        showError(res, "loadHome")
        return
    end if
    m.homeVideos = res.data
    tryBuildHome()
end sub

sub onHomeCategories(res as object)
    if res.ok then
        m.categories = res.data.categories
    else
        LogMsg("categories unavailable", { code: res.code })
        m.categories = []
    end if
    tryBuildHome()
end sub

sub tryBuildHome()
    if m.homeVideos = invalid or m.categories = invalid then return
    showLoading(false)
    m.home.callFunc("setContent", { videos: m.homeVideos.videos, categories: m.categories, hasMore: m.homeVideos.hasMore })
    m.homeLoaded = true

    ' Lazily fill one preview row per category (capped to keep startup light).
    maxRows = 8
    i = 0
    for each cat in m.categories
        if i >= maxRows then exit for
        apiGet("/videos", { category: cat.id, page: "1", perPage: "12" }, "home:row:" + cat.id, cat)
        i = i + 1
    end for
end sub

sub onHomeRow(res as object, cat as object)
    if not res.ok or cat = invalid then return
    m.home.callFunc("setCategoryRow", { category: cat, videos: res.data.videos })
end sub

sub onCategorySelected(event as object)
    cat = event.getData()
    if cat = invalid then return
    openGrid(cat)
end sub

' ---------------------------------------------------------------------------
' Grid (library / category browse with paging)
' ---------------------------------------------------------------------------

sub openGrid(cat as object)
    grid = CreateObject("roSGNode", "VideoGrid")
    grid.title = cat.name
    grid.categoryId = cat.id
    grid.observeField("selectedVideo", "onVideoSelected")
    grid.observeField("requestPage", "onGridRequestPage")
    pushScreen(grid)
    requestGridPage(grid, 1)
end sub

sub onGridRequestPage(event as object)
    grid = event.getRoSGNode()
    page = event.getData()
    if page <= 0 then return
    requestGridPage(grid, page)
end sub

sub requestGridPage(grid as object, page as integer)
    query = { page: page.toStr(), perPage: m.cfg.PAGE_SIZE.toStr() }
    if grid.categoryId <> invalid and grid.categoryId <> "" then query.category = grid.categoryId
    if page = 1 then showLoading(true)
    grid.loading = true
    apiGet("/videos", query, "grid:" + grid.categoryId + ":" + page.toStr(), grid)
end sub

sub onGridPage(res as object, grid as object)
    showLoading(false)
    if grid = invalid then return
    grid.loading = false
    if not res.ok then
        if grid.itemCount = 0 then
            showError(res, "popScreen")
        else
            grid.statusText = FriendlyError(res.code)
        end if
        return
    end if
    grid.callFunc("appendPage", res.data)
end sub

' ---------------------------------------------------------------------------
' Details + playback
' ---------------------------------------------------------------------------

sub onVideoSelected(event as object)
    item = event.getData()
    if item = invalid then return
    details = CreateObject("roSGNode", "DetailsScreen")
    details.content = item
    details.observeField("playRequested", "onPlayRequested")
    pushScreen(details)
end sub

sub onPlayRequested(event as object)
    if not event.getData() then return
    details = event.getRoSGNode()
    item = details.content
    startPlayback(item)
end sub

' Always asks the backend for a fresh stream URL right before playing.
sub startPlayback(item as object)
    showLoading(true, "Starting playback…")
    apiGet("/videos/" + item.id + "/play", invalid, "play:" + item.id, item)
end sub

sub onPlayback(res as object, item as object)
    showLoading(false)
    if not res.ok then
        showError(res, invalid)
        return
    end if
    player = CreateObject("roSGNode", "VideoPlayer")
    player.playback = res.data
    player.meta = item
    player.observeField("closed", "onPlayerClosed")
    player.observeField("errorMessage", "onPlayerError")
    pushScreen(player)
end sub

sub onPlayerClosed(event as object)
    if event.getData() then popScreen()
end sub

sub onPlayerError(event as object)
    message = event.getData()
    if message = invalid or message = "" then return
    popScreen()
    showMessage("Playback problem", message, invalid)
end sub

' ---------------------------------------------------------------------------
' Errors
' ---------------------------------------------------------------------------

' retryAction: name of a sub to call when the user picks "Try again", or invalid.
sub showError(res as object, retryAction as dynamic)
    LogMsg("error", { code: res.code, status: res.status, message: res.message })
    showMessage("Something went wrong", FriendlyError(res.code), retryAction)
end sub

sub showMessage(title as string, message as string, retryAction as dynamic)
    dialog = CreateObject("roSGNode", "Dialog")
    dialog.title = title
    dialog.message = message
    if retryAction <> invalid then
        dialog.buttons = ["Try again", "Close"]
    else
        dialog.buttons = ["OK"]
    end if
    if retryAction = invalid then retryAction = ""
    dialog.addFields({ retryAction: retryAction })
    dialog.observeField("buttonSelected", "onDialogButton")
    dialog.observeField("wasClosed", "onDialogClosed")
    m.top.dialog = dialog
end sub

sub onDialogButton(event as object)
    dialog = event.getRoSGNode()
    idx = event.getData()
    action = dialog.retryAction
    dialog.close = true
    if idx = 0 and action <> "" then
        if action = "loadHome" then
            loadHome()
        else if action = "popScreen" then
            popScreen()
        end if
    else if action = "popScreen" then
        popScreen()
    end if
end sub

sub onDialogClosed(event as object)
    top = m.stack.peek()
    if top <> invalid then top.setFocus(true)
end sub

' ---------------------------------------------------------------------------
' Deep linking (future): roku launches with contentId + mediaType
' ---------------------------------------------------------------------------

sub onLaunchArgs()
    args = m.top.launchArgs
    if args = invalid or args.contentId = invalid then return
    LogMsg("deep link", args)
    stub = CreateObject("roSGNode", "ContentNode")
    stub.id = args.contentId
    stub.title = ""
    if args.mediaType = "movie" or args.mediaType = "episode" or args.mediaType = "short-form" then
        startPlayback(stub)
    end if
end sub
