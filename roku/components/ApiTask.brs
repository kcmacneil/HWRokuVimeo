sub init()
    m.top.functionName = "execute"
end sub

sub execute()
    req = m.top.request
    cfg = AppConfig()
    tag = ""
    if req <> invalid and req.tag <> invalid then tag = req.tag

    if req = invalid or req.path = invalid then
        m.top.response = { ok: false, status: 0, code: "BAD_REQUEST", message: "Missing request path", tag: tag }
        return
    end if

    url = cfg.API_BASE_URL + req.path
    if req.query <> invalid then
        qs = ""
        for each key in req.query
            value = req.query[key]
            if value <> invalid then
                if qs <> "" then qs = qs + "&"
                qs = qs + key + "=" + EncodeQuery(value)
            end if
        end for
        if qs <> "" then url = url + "?" + qs
    end if

    port = CreateObject("roMessagePort")
    xfer = CreateObject("roUrlTransfer")
    xfer.setMessagePort(port)
    xfer.setUrl(url)
    xfer.setCertificatesFile("common:/certs/ca-bundle.crt")
    xfer.initClientCertificates()
    xfer.retainBodyOnError(true)
    xfer.addHeader("Accept", "application/json")
    xfer.addHeader("User-Agent", "HWVimeoRoku/" + GetAppVersion())
    if cfg.API_KEY <> "" then xfer.addHeader("X-Api-Key", cfg.API_KEY)

    LogMsg("GET " + url)
    started = CreateObject("roTimespan")
    if not xfer.asyncGetToString() then
        m.top.response = { ok: false, status: 0, code: "NETWORK", message: "Request could not start", tag: tag }
        return
    end if

    msg = wait(cfg.REQUEST_TIMEOUT_MS, port)
    if msg = invalid then
        xfer.asyncCancel()
        LogMsg("timeout after " + started.totalMilliseconds().toStr() + "ms")
        m.top.response = { ok: false, status: 0, code: "TIMEOUT", message: "Request timed out", tag: tag }
        return
    end if

    if type(msg) <> "roUrlEvent" then
        m.top.response = { ok: false, status: 0, code: "NETWORK", message: "Unexpected event", tag: tag }
        return
    end if

    status = msg.getResponseCode()
    body = msg.getString()
    LogMsg("<- " + status.toStr() + " (" + started.totalMilliseconds().toStr() + "ms)")

    if status <= 0 then
        ' Negative codes are curl errors (e.g. -3 DNS, -6 could not resolve host, -28 timeout)
        m.top.response = { ok: false, status: status, code: "NETWORK", message: msg.getFailureReason(), tag: tag }
        return
    end if

    data = invalid
    if body <> invalid and body <> "" then data = ParseJson(body)

    if status >= 200 and status < 300 then
        if data = invalid then
            m.top.response = { ok: false, status: status, code: "BAD_RESPONSE", message: "Invalid JSON from server", tag: tag }
        else
            m.top.response = { ok: true, status: status, data: data, tag: tag }
        end if
        return
    end if

    code = "SERVER_ERROR"
    message = "HTTP " + status.toStr()
    if data <> invalid and data.error <> invalid then
        if data.error.code <> invalid then code = data.error.code
        if data.error.message <> invalid then message = data.error.message
    end if
    m.top.response = { ok: false, status: status, code: code, message: message, tag: tag }
end sub

function EncodeQuery(value as dynamic) as string
    xfer = CreateObject("roUrlTransfer")
    if type(value) = "roString" or type(value) = "String" then return xfer.escape(value)
    return xfer.escape(value.toStr())
end function

function GetAppVersion() as string
    info = CreateObject("roAppInfo")
    return info.getVersion()
end function
