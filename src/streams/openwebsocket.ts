// Time in milliseconds we want to wait for a websocket to open
const WEBSOCKET_TIMEOUT = 10007
// Time in milliseconds to send JS event when no data flows through the websocket
const TIMEOUT_INTERVAL = 3000

export interface WebSocketConfig {
  uri: string
  tokenUri?: string
  protocol?: string
  timeout?: number
}

/**
 * Emit a custom event with the given name and details.
 * @param  name - The name of the event.
 * @param  detail - The details to include in the event.
 */
const emitCustomEvent = (name: string, detail: any) => {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

/**
 * Open a new WebSocket, fallback to token-auth on failure and retry.
 */
export const openWebSocket = async ({
  uri,
  tokenUri,
  protocol = 'binary',
  timeout = WEBSOCKET_TIMEOUT,
}: WebSocketConfig): Promise<WebSocket> => {
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
        emitCustomEvent('AxisMediaStreamLibrary:WebSocketErrorStream', { error: originalError })
        if (!tokenUri) {
          console.warn(
            'websocket open failed and no token URI specified, quiting'
          )
          reject(originalError)
        }
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
      ws.onopen = (openEvent: Event) => {
        clearTimeout(countdown)
        emitCustomEvent('AxisMediaStreamLibrary:WebSocketOpenStream', { event: openEvent })
        resolve(ws)
      }
      ws.addEventListener('close', (closeEvent: Event) => {
        emitCustomEvent('AxisMediaStreamLibrary:WebSocketCloseStream', { event: closeEvent })
      })

      let lastMessageTime = Date.now()
      const checkTimeout = () => {
        if (Date.now() - lastMessageTime > TIMEOUT_INTERVAL) {
          ws.removeEventListener('message', messageHandler) // Unsubscribe the message event handler
          clearInterval(timeoutInterval) // Stop the interval
          emitCustomEvent('AxisMediaStreamLibrary:WebSocketStreamTimeout', { message: 'No data received in 3 seconds' })
        }
      }
      const timeoutInterval = setInterval(checkTimeout, TIMEOUT_INTERVAL)

      const messageHandler = () => {
        lastMessageTime = Date.now() // log the time of the last message received
      }
      ws.addEventListener('message', messageHandler)
    } catch (e) {
      reject(e)
    }
  })
}
