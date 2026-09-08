// Usage: node scripts/memories-device-check.mjs <agent-browser CDP URL>
// Requires seeded local mock memories. Call seedMemories() from memories-browser.js, then reload.
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const output = join(tmpdir(), 'ember-memory-review')
mkdirSync(output, { recursive: true })
if (!process.argv[2]) throw Error('An agent-browser CDP URL is required')
const socket = new WebSocket(process.argv[2])
await new Promise(r=>socket.addEventListener('open',r,{once:true}))
let next=0;const pending=new Map()
socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}})
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,sessionId}))})
const {targetInfos}=await call('Target.getTargets')
const target=targetInfos.find(t=>t.type==='page'&&t.url.includes('localhost:5173'))
const {sessionId}=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true})
const page=(method,params)=>call(method,params,sessionId)
const evaluate=async expression=>{const result=await page('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value}
for(const [name,width,height,mobile] of [['desktop',1280,800,false],['portrait',393,852,true],['landscape',852,393,true]]) {
  await page('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile})
  await page('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5})
  await page('Emulation.setEmitTouchEventsForMouse',{enabled:mobile,configuration:'mobile'})
  await page('Page.navigate',{url:'http://localhost:5173/?section=lanterns&mock=1&shot=1'})
  await new Promise(r=>setTimeout(r,900))
  await evaluate(`(async()=>{for(let i=0;i<200&&!window.__walk;i++)await new Promise(r=>setTimeout(r,50));const enter=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='come in');enter?.click();for(let i=0;i<100&&window.__walk.pictures<window.__walk.near;i++)await new Promise(r=>setTimeout(r,50));await new Promise(r=>setTimeout(r,500));return true})()`)
  let shot=await page('Page.captureScreenshot',{format:'png'});writeFileSync(join(output,name+'-walk.png'),Buffer.from(shot.data,'base64'))
  const point=await evaluate(`window.__walk.seen.filter(p=>p.x>20&&p.x<innerWidth-20&&p.y>60&&p.y<innerHeight-90&&window.__walk.pick(p.x,p.y)===p.i).sort((a,b)=>b.i-a.i)[0]`)
  if(!point)throw Error('No visible selectable photograph on '+name)
  if(mobile)await page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:1}]})
  else await page('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1})
  await new Promise(r=>setTimeout(r,mobile?80:550))
  if(mobile)await page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  else await page('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1})
  await evaluate(`(async()=>{for(let i=0;i<100&&!document.querySelector('.memory-original');i++)await new Promise(r=>setTimeout(r,50));await new Promise(r=>setTimeout(r,400));return true})()`)
  const state=await evaluate(`import('/scripts/memories-browser.js').then(m=>m.inspectViewer())`)
  if(!state.open||state.width<width*.95||state.height<height*.95||state.sourceWidth<700||state.objectFit!=='contain')throw Error(name+JSON.stringify(state))
  console.log('PASS '+name+' '+JSON.stringify(state))
  shot=await page('Page.captureScreenshot',{format:'png'});writeFileSync(join(output,name+'-viewer.png'),Buffer.from(shot.data,'base64'))
  await evaluate(`document.querySelector('.memory-show-words').click();document.querySelector('.memory-actions button').click()`)
  if(!await evaluate(`!!document.querySelector('.memory-letter')`))throw Error('Turn over failed')
  await evaluate(`document.querySelector('.memory-close').click()`)
  if(await evaluate(`document.getElementById('root').inert`))throw Error('Background remains locked')
}
socket.close()
