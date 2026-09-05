' Entry point. Creates the scene and pumps the message loop.
sub Main(args as dynamic)
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.setMessagePort(port)

    scene = screen.CreateScene("MainScene")
    screen.show()

    ' Deep-link ready: pass launch args (contentId / mediaType) to the scene.
    if args <> invalid then
        scene.launchArgs = args
    end if

    while true
        msg = wait(0, port)
        msgType = type(msg)
        if msgType = "roSGScreenEvent" then
            if msg.isScreenClosed() then return
        end if
    end while
end sub
