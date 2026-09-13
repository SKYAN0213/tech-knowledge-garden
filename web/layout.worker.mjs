import { layoutGraph } from "./layout.mjs"
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ nodes: layoutGraph(data) })
  } catch (error) {
    self.postMessage({ error: error.message })
  }
}
