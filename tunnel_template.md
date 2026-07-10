# Template

```
serverAddr = "<%= host %>"
serverPort = 7000
loginFailExit = false
log.disablePrintColor = true
user = "<%= cfg.username %>"
metadatas.token = "<%= cfg.token %>"
<% if (cfg.lowLatencyMode) { %>
transport.protocol = "kcp"
<% } %>

[[proxies]]
name = "web"
type = "http"
localPort = <%= server.port %>
subdomain = "<%= cfg.subdomain %>"
<% if (cfg.httpName != "") { %>
httpUser = "<%= cfg.httpName %>"
httpPassword = "<%= cfg.httpPassword %>"
<% } %>
```