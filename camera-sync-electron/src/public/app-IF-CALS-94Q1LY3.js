class App{constructor(){this.peer=null;this.connections=new Map();this.stream=null;this.media=[];this.recorder=null;this.chunks=[];this.$=id=>document.getElementById(id);this.bind();this.initPeer();// Placeholder while we fetch LAN URLs later
this.$('endpoint').textContent = 'Receiver URL: loading…';}
bind(){this.$('controller').onclick=()=>this.mode('controller');this.$('receiver').onclick=()=>this.mode('receiver');this.$('join').onclick=()=>this.connect();this.$('capture').onclick=()=>this.broadcast({type:'PHOTO_AT',at:Date.now()+800});this.$('record').onclick=()=>this.broadcast({type:'START_AT',at:Date.now()+800});this.$('stop').onclick=()=>this.broadcast({type:'STOP_AT',at:Date.now()+800});this.$('download').onclick=()=>this.download();this.$('clear').onclick=()=>{this.media=[];this.$('gallery').innerHTML='';this.buttons()};this.$('back1').onclick=this.$('back2').onclick=()=>location.reload();}
initPeer(){this.peer=new Peer({host:location.hostname,port:Number(location.port),path:'/peerjs',secure:location.protocol==='https:',debug:1});this.peer.on('open',id=>{this.$('status').textContent='Signaling ready';this.$('peerId').value=id});this.peer.on('connection',c=>this.accept(c));this.peer.on('error',e=>this.$('status').textContent='Peer error: '+e.type)}
async camera(){if(!this.stream){this.stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:false});this.$('preview').srcObject=this.stream}return this.stream}
async mode(which){
    // Only request camera access for the receiver (guest) role.
    if (which === 'receiver') {
        try {
            await this.camera();
        } catch (e) {
            alert('Camera unavailable: ' + e.message);
            return;
        }
    }
    this.$('home').hidden = true;
    this.$(which + 'Panel').hidden = false;
    if (which === 'controller') {
        const id = this.$('peerId').value;
        if (id) this.$('qr').src = '/qr?data=' + encodeURIComponent(id);
        // Controller does not need camera, so keep capture/record disabled.
        this.$('capture').disabled = true;
        this.$('record').disabled = true;
    } else {
        // Receiver (guest) can capture and record.
        this.$('capture').disabled = false;
        this.$('record').disabled = false;
    }
}
accept(c){const key=c.connectionId||c.peer;if(this.connections.has(key))return;this.connections.set(key,c);c.on('open',()=>this.count());c.on('data',d=>{if(d&&typeof d==='object')this.command(d)});c.on('error',()=>{this.connections.delete(key);this.count()});c.on('close',()=>{this.connections.delete(key);this.count()})}
connect(){const id=this.$('controllerId').value.trim();if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)){alert('Enter a valid Controller ID.');return;}const c=this.peer.connect(id,{reliable:true});this.accept(c);c.on('open',()=>this.$('status').textContent='Connected to controller')}
count(){this.$('count').textContent=[...this.connections.values()].filter(c=>c.open).length}
broadcast(msg){for(const c of this.connections.values())if(c.open)c.send(msg);this.command(msg)}
command(d){if(!d||!['PHOTO_AT','START_AT','STOP_AT'].includes(d.type))return;const at=Number(d.at);if(!Number.isFinite(at)||Math.abs(at-Date.now())>30000)return;const delay=Math.max(0,at-Date.now());if(d.type==='PHOTO_AT')setTimeout(()=>this.photo(),delay);if(d.type==='START_AT')setTimeout(()=>this.startRecording(),delay);if(d.type==='STOP_AT')setTimeout(()=>this.stopRecording(),delay)}
photo(){const v=this.$('preview'),c=this.$('captureCanvas');if(!v.videoWidth||!v.videoHeight){this.$('status').textContent='Camera preview is not ready.';return;}c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);c.toBlob(b=>this.add(b,'jpg'),'image/jpeg',.95)}
startRecording(){if(!this.stream||this.recorder?.state==='recording'||typeof MediaRecorder==='undefined')return;this.chunks=[];this.recorder=new MediaRecorder(this.stream);this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data)};const rec=this.recorder;rec.onstop=()=>{if(this.chunks.length)this.add(new Blob(this.chunks,{type:rec.mimeType||'video/webm'}),'webm');};rec.onerror=()=>{this.$('status').textContent='Recording failed.';this.$('record').disabled=false;this.$('stop').disabled=true;};this.recorder.start(250);this.$('stop').disabled=false;this.$('record').disabled=true}
stopRecording(){if(this.recorder?.state==='recording')this.recorder.stop();this.$('stop').disabled=true;this.$('record').disabled=false}
add(blob,ext){const name=`camera_sync_${Date.now()}.${ext}`;if(!blob||!blob.size)return;this.media.push({blob,name});const url=URL.createObjectURL(blob),el=document.createElement(ext==='jpg'?'img':'video');el.src=url;if(ext!=='jpg')el.controls=true;this.$('gallery').appendChild(el);this.buttons()}
buttons(){const empty=!this.media.length;this.$('download').disabled=empty;this.$('clear').disabled=empty}
async download(){const zip=new JSZip();for(const m of this.media)zip.file(m.name,m.blob);const b=await zip.generateAsync({type:'blob'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='camera_sync_media.zip';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}}
addEventListener('DOMContentLoaded',()=>{ const app = new App();
  const app = new App();
  // Always show Receiver QR code (use LAN URL for remote devices)
  const qrImg = document.getElementById('receiverQr');
  if (qrImg) {
    // Fetch the LAN URL from the server; fallback to location.origin if unavailable
    fetch('/lan')
      .then(r => r.json())
      .then(data => {
        // Prefer the first LAN URL that is not the loopback address.
        const candidates = data.lanUrls && data.lanUrls.length ? data.lanUrls : [data.lanUrl];
        const url = candidates.find(u => !u.includes('127.0.0.1')) || candidates[0] || location.origin;
        // Update the displayed endpoint text
        this.$('endpoint').textContent = `Receiver URL: ${url}`;
        // Set QR code to the same URL
        qrImg.src = `/qr?data=${encodeURIComponent(url)}`;
        qrImg.hidden = false;
      })
      .catch(() => {
        const url = location.origin;
        this.$('endpoint').textContent = `Receiver URL: ${url}`;
        qrImg.src = `/qr?data=${encodeURIComponent(url)}`;
        qrImg.hidden = false;
      });
  }
});