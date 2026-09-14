'use strict';

// Pure rules are independent of the interface and can also be tested in Node.
const Rules = (() => {
  const shapes = [
    [[0,0]], [[0,0],[1,0]], [[0,0],[1,0],[2,0]],
    [[0,0],[1,0],[2,0],[3,0]], [[0,0],[1,0],[2,0],[3,0],[4,0]],
    [[0,0],[0,1]], [[0,0],[0,1],[0,2]], [[0,0],[0,1],[0,2],[0,3]],
    [[0,0],[1,0],[0,1],[1,1]],
    [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]],
    [[0,0],[0,1],[1,1]], [[0,0],[1,0],[0,1]], [[0,0],[1,0],[1,1]], [[1,0],[0,1],[1,1]],
    [[0,0],[0,1],[0,2],[1,2]], [[1,0],[1,1],[0,2],[1,2]],
    [[0,0],[1,0],[2,0],[1,1]], [[1,0],[0,1],[1,1],[1,2]],
    [[1,0],[2,0],[0,1],[1,1]], [[0,0],[1,0],[1,1],[2,1]],
    [[0,0],[0,1],[0,2],[1,2],[2,2]], [[1,0],[0,1],[1,1],[2,1],[1,2]],
    [[0,0],[2,0],[0,1],[1,1],[2,1]], [[0,0],[0,1],[1,1],[1,2],[2,2]]
  ];
  const empty = () => Array.from({length:8}, () => Array(8).fill(null));
  const fits = (board, shape, x, y) => shape.every(([dx,dy]) => x+dx>=0 && x+dx<8 && y+dy>=0 && y+dy<8 && !board[y+dy][x+dx]);
  function lines(board) {
    const rows=[], cols=[], cells=new Set();
    for(let i=0;i<8;i++) {
      if(board[i].every(Boolean)) rows.push(i);
      if(board.every(row=>Boolean(row[i]))) cols.push(i);
    }
    rows.forEach(y=>{for(let x=0;x<8;x++) cells.add(y*8+x);});
    cols.forEach(x=>{for(let y=0;y<8;y++) cells.add(y*8+x);});
    return {count:rows.length+cols.length,cells:[...cells]};
  }
  const hasMove = (board,pieces) => pieces.some(p=>p && board.some((row,y)=>row.some((_,x)=>fits(board,p.shape,x,y))));
  const points = (blocks, count, combo) => blocks + (count===0?0:count===1?10:count===2?25:50+(count-3)*15)*combo;
  return {shapes,empty,fits,lines,hasMove,points};
})();
if(typeof module!=='undefined') module.exports=Rules;

if(typeof document!=='undefined') (() => {
  const $=id=>document.getElementById(id);
  const colors=['#a98aed','#70b8ef','#f0ae68','#76ceb1','#eb839d','#e4ce70'];
  const read=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
  const save=(key,value)=>{try{localStorage.setItem(key,String(value));}catch{/* Private mode may disable storage. */}};
  let board, pieces, score=0, combo=0, best=Math.max(0,Number(read('kubika.best',0))||0);
  let sound=read('kubika.sound','true')==='true', audio, busy=false, selected=null, drag=null, round=0;
  const cells=[];
  for(let i=0;i<64;i++) {
    const cell=document.createElement('button'); cell.className='cell';cell.setAttribute('role','gridcell');
    cell.addEventListener('click',()=>{if(selected!==null&&!drag) place(selected,i%8,Math.floor(i/8));});
    $('board').append(cell);cells.push(cell);
  }
  function tone(clear=false) {
    if(!sound)return;
    try {
      audio??=new (window.AudioContext||window.webkitAudioContext)();
      audio.resume().catch(()=>{});
      (clear?[523,659,784]:[330,440]).forEach((f,i)=>{
        const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.065;
        o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.065,t+.01);g.gain.exponentialRampToValueAtTime(.001,t+.17);
        o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.18);
      });
    }catch{/* Audio is optional. */}
  }
  function updateSound(){ $('sound').textContent=sound?'♪':'♪̸';$('sound').setAttribute('aria-label',sound?'Выключить звук':'Включить звук');$('sound').setAttribute('aria-pressed',String(sound)); }
  $('sound').onclick=()=>{sound=!sound;save('kubika.sound',sound);updateSound();if(sound)tone();};
  function dimensions(shape){return {w:Math.max(...shape.map(c=>c[0]))+1,h:Math.max(...shape.map(c=>c[1]))+1};}
  function pieceElement(p,unit,gap=3){
    const d=dimensions(p.shape),el=document.createElement('div');el.className='piece';
    el.style.cssText=`grid-template-columns:repeat(${d.w},${unit}px);grid-template-rows:repeat(${d.h},${unit}px);gap:${gap}px;--color:${p.color}`;
    p.shape.forEach(([x,y])=>{const b=document.createElement('span');b.className='block';b.style.gridColumn=x+1;b.style.gridRow=y+1;el.append(b);});return el;
  }
  function deal(){pieces=Array.from({length:3},()=>({shape:Rules.shapes[Math.floor(Math.random()*Rules.shapes.length)],color:colors[Math.floor(Math.random()*colors.length)]}));}
  function renderTray(){
    $('tray').replaceChildren();
    pieces.forEach((p,i)=>{
      const slot=document.createElement('button');slot.className='slot'+(!p?' used':'')+(selected===i?' selected':'');slot.disabled=!p||busy;
      slot.setAttribute('aria-label',p?`Фигура ${i+1}: ${p.shape.length} блоков. Выберите и нажмите на клетку или перетащите.`:'Фигура использована');
      if(p){const unit=Math.min(21,($('tray').clientWidth/3-34)/5);slot.append(pieceElement(p,unit));slot.addEventListener('pointerdown',e=>startDrag(e,i,slot));slot.addEventListener('click',e=>{if(e.detail===0){selected=i;renderTray();}});}
      $('tray').append(slot);
    });
  }
  function renderBoard(){cells.forEach((el,i)=>{const color=board[Math.floor(i/8)][i%8];el.className='cell'+(color?' filled':'');el.style.setProperty('--color',color||'transparent');el.setAttribute('aria-label',`Ряд ${Math.floor(i/8)+1}, столбец ${i%8+1}: ${color?'занято':'свободно'}`);});}
  function updateScore(){if(score>best){best=score;save('kubika.best',best);} $('score').textContent=score;$('best').textContent=best;$('combo').textContent=combo>=2?`COMBO x${combo}`:'Твой следующий ход';}
  function gameOver(){if(!Rules.hasMove(board,pieces)){ $('final-score').textContent=score;$('final-best').textContent=best;$('game-over').showModal();}}
  async function place(index,x,y){
    const p=pieces[index];if(busy||!p||!Rules.fits(board,p.shape,x,y))return false;
    busy=true;const token=round;selected=null;
    p.shape.forEach(([dx,dy])=>board[y+dy][x+dx]=p.color);pieces[index]=null;
    renderBoard();p.shape.forEach(([dx,dy])=>cells[(y+dy)*8+x+dx].classList.add('placed'));
    const cleared=Rules.lines(board);combo=cleared.count?combo+1:0;
    const gained=Rules.points(p.shape.length,cleared.count,combo);score+=gained;updateScore();renderTray();tone(cleared.count>0);
    $('points').textContent=`+${gained}`;$('points').classList.remove('float');void $('points').offsetWidth;$('points').classList.add('float');
    if(cleared.count){
      cleared.cells.forEach(i=>cells[i].classList.add('clearing'));
      if(combo>=2){$('board').classList.remove('shake');void $('board').offsetWidth;$('board').classList.add('shake');try{navigator.vibrate?.(25);}catch{}}
      await new Promise(resolve=>setTimeout(resolve,310));if(token!==round)return false;
      cleared.cells.forEach(i=>board[Math.floor(i/8)][i%8]=null);
    }
    if(pieces.every(p=>!p))deal();busy=false;renderBoard();renderTray();gameOver();return true;
  }
  function clearPreview(){cells.forEach(el=>el.classList.remove('preview-good','preview-bad'));}
  function startDrag(e,index,slot){
    if(busy||drag||e.button!==0)return;e.preventDefault();selected=index;
    const p=pieces[index],rect=cells[0].getBoundingClientRect(),step=cells[1].getBoundingClientRect().left-rect.left,d=dimensions(p.shape);
    const width=d.w*step-(step-rect.width),height=d.h*step-(step-rect.height);
    drag={index,id:e.pointerId,slot,startX:e.clientX,startY:e.clientY,moved:false,width,height,step,unit:rect.width,touch:e.pointerType==='touch',x:null,y:null};
    slot.setPointerCapture(e.pointerId);slot.classList.add('dragging');
    $('ghost').replaceChildren(pieceElement(p,rect.width,step-rect.width));
    slot.addEventListener('pointermove',moveDrag);slot.addEventListener('pointerup',endDrag);slot.addEventListener('pointercancel',cancelDrag);slot.addEventListener('lostpointercapture',cancelDrag);
  }
  function moveDrag(e){
    if(!drag||e.pointerId!==drag.id)return;e.preventDefault();const d=drag;
    if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>5)d.moved=true;if(!d.moved)return;
    const left=e.clientX-d.width/2,top=e.clientY-(d.touch?d.height+32:d.height/2),rect=cells[0].getBoundingClientRect();
    d.x=Math.round((left-rect.left)/d.step);d.y=Math.round((top-rect.top)/d.step);
    const valid=Rules.fits(board,pieces[d.index].shape,d.x,d.y);
    $('ghost').style.display='block';$('ghost').style.transform=`translate(${left}px,${top}px)`;$('ghost').classList.toggle('invalid',!valid);clearPreview();
    pieces[d.index].shape.forEach(([dx,dy])=>{const x=d.x+dx,y=d.y+dy;if(x>=0&&x<8&&y>=0&&y<8)cells[y*8+x].classList.add(valid?'preview-good':'preview-bad');});
  }
  function cleanup(){
    if(!drag)return;const {slot,id}=drag;drag=null;
    slot.removeEventListener('pointermove',moveDrag);slot.removeEventListener('pointerup',endDrag);slot.removeEventListener('pointercancel',cancelDrag);slot.removeEventListener('lostpointercapture',cancelDrag);
    if(slot.hasPointerCapture(id))slot.releasePointerCapture(id);slot.classList.remove('dragging');$('ghost').style.display='none';clearPreview();
  }
  function endDrag(e){if(!drag||e.pointerId!==drag.id)return;moveDrag(e);const d=drag;cleanup();if(d.moved&&d.x!==null){selected=null;place(d.index,d.x,d.y);}renderTray();}
  function cancelDrag(){cleanup();selected=null;renderTray();}
  function newGame(){round++;cleanup();board=Rules.empty();score=0;combo=0;selected=null;busy=false;deal();$('game-over').close();$('points').textContent='';renderBoard();renderTray();updateScore();}
  ['new-game','retry','restart'].forEach(id=>$(id).onclick=newGame);
  $('game-over').addEventListener('cancel',e=>e.preventDefault());
  window.addEventListener('resize',()=>{cancelDrag();});window.addEventListener('blur',()=>{if(drag)cancelDrag();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')cancelDrag();});
  updateSound();newGame();
})();

