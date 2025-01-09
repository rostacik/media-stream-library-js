import { merge } from '../../utils/config'

// Time in milliseconds we want to wait for a websocket to open
const WEBSOCKET_TIMEOUT = 10007;
const TIMEOUT_INTERVAL = 3000;

export interface WSConfig {
  host?: string
  scheme?: string
  uri?: string
  tokenUri?: string
  protocol?: string
  timeout?: number
}

// Default configuration
const defaultConfig = (
  host: string = window.location.host,
  scheme: string = window.location.protocol
): WSConfig => {
  const wsScheme = scheme === 'https:' ? 'wss:' : 'ws:'

  return {
    uri: `${wsScheme}//${host}/rtsp-over-websocket`,
    tokenUri: `${scheme}//${host}/axis-cgi/rtspwssession.cgi`,
    protocol: 'binary',
    timeout: WEBSOCKET_TIMEOUT,
  }
}

/**
 * Emit a custom event with the given name and details.
 * @param  name - The name of the event.
 * @param  detail - The details to include in the event.
 */
const emitCustomEvent = (name: string, detail: any) => {
  const event = new CustomEvent(name, { detail });
  window.dispatchEvent(event);
}

/**
 * Open a new WebSocket, fallback to token-auth on failure and retry.
 * @param  [config]  WebSocket configuration.
 * @param  [config.host]  Specify different host
 * @param  [config.sheme]  Specify different scheme.
 * @param  [config.uri]  Full uri for websocket connection
 * @param  [config.tokenUri]  Full uri for token API
 * @param  [config.protocol] Websocket protocol
 * @param  [config.timeout] Websocket connection timeout
 */
export const openWebSocket = async (
  config: WSConfig = {}
): Promise<WebSocket> => {
  const { uri, tokenUri, protocol, timeout } = merge(
    defaultConfig(config.host, config.scheme),
    config
  )

  if (uri === undefined) {
    throw new Error('ws: internal error')
  }

  return await new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(uri, protocol)
      const countdown = setTimeout(() => {
        clearTimeout(countdown)
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onerror = null
          reject(new Error('websocket connection timed out'))
        }
      }, timeout)
      ws.binaryType = 'arraybuffer'
      ws.onerror = (originalError: Event) => {
        clearTimeout(countdown)
        emitCustomEvent('WebSocketErrorStream', { error: originalError })
        // try fetching an authentication token
        function onLoadToken(this: XMLHttpRequest) {
          if (this.status >= 400) {
            console.warn('failed to load token', this.status, this.responseText)
            reject(originalError)
            return
          }
          const token = this.responseText.trim()
          // We have a token! attempt to open a WebSocket again.
          const newUri = `${uri}?rtspwssession=${token}`
          const ws2 = new WebSocket(newUri, protocol)
          ws2.binaryType = 'arraybuffer'
          ws2.onerror = (err) => {
            reject(err)
          }
          ws2.onopen = () => resolve(ws2)
        }
        const request = new XMLHttpRequest()
        request.addEventListener('load', onLoadToken)
        request.addEventListener('error', (err) => {
          console.warn('failed to get token')
          reject(err)
        })
        request.addEventListener('abort', () => reject(originalError))
        request.open('GET', `${tokenUri}?${Date.now()}`)
        try {
          request.send()
        } catch (error) {
          reject(originalError)
        }
      }
      ws.addEventListener('open', (openEvent: Event) => {
        clearTimeout(countdown)
        emitCustomEvent('WebSocketOpenStream', { event: openEvent });
        resolve(ws)
      })
      ws.addEventListener('close', (closeEvent: Event) => {
        emitCustomEvent('WebSocketCloseStream', { event: closeEvent });
      })

      let lastMessageTime = Date.now();
      const checkTimeout = () => {
        if (Date.now() - lastMessageTime > TIMEOUT_INTERVAL) {
          ws.removeEventListener('message', messageHandler); // Unsubscribe the message event handler
          clearInterval(timeoutInterval); // Stop the interval
          emitCustomEvent('WebSocketStreamTimeout', { message: 'No data received in 3 seconds' });
        }
      }
      const messageHandler = () => {
        lastMessageTime = Date.now(); // log the time of the last message
      }
      const timeoutInterval = setInterval(checkTimeout, TIMEOUT_INTERVAL);
      ws.addEventListener('message', messageHandler);
    } catch (e) {
      reject(e)
    }
  })
}
