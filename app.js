const MU0 = 4 * Math.PI * 1e-7;
const params = { wireLength:80, wireDiam:0.8, frameDiam:30, current:1, lMin:10, lMax:180 };
const controlDefs = [
  ['wireLength','Длина провода L',5,250,1,'м'],
  ['wireDiam','Диаметр провода d',0.2,3,0.1,'мм'],
  ['frameDiam','Диаметр каркаса D',10,120,1,'мм'],
  ['current','Ток I',0.1,10,0.1,'А'],
  ['lMin','Минимальная длина l',5,80,1,'мм'],
  ['lMax','Максимальная длина l',90,300,1,'мм']
];
function fieldAtCenter(p, coilLength){
  const d=p.wireDiam/1000, D=p.frameDiam/1000, I=p.current;
  const turnsPerLayer=Math.max(1,Math.floor(coilLength/d));
  let remaining=p.wireLength, B=0, N=0, layers=0;
  const dx=coilLength/turnsPerLayer;
  for(let j=0; remaining>0; j++){
    const r=D/2+d/2+j*d;
    const turnLength=2*Math.PI*r;
    const turns=Math.min(turnsPerLayer,Math.floor(remaining/turnLength));
    if(turns<=0) break;
    layers++;
    for(let i=0;i<turns;i++){
      const x=-coilLength/2+(i+0.5)*dx;
      B += MU0*I*r*r/(2*Math.pow(r*r+x*x,1.5));
    }
    N += turns;
    remaining -= turns*turnLength;
  }
  const Lcoil=MU0*N*N*Math.PI*Math.pow(D/2,2)/coilLength;
  return { length:coilLength, B, N, layers, Lcoil };
}
function makeData(){
  const arr=[], min=params.lMin/1000, max=params.lMax/1000;
  for(let k=0;k<=140;k++) arr.push(fieldAtCenter(params,min+(max-min)*k/140));
  return arr;
}
function renderControls(){
  const box=document.getElementById('controls'); box.innerHTML='';
  controlDefs.forEach(([key,label,min,max,step,unit])=>{
    const el=document.createElement('label'); el.className='control';
    el.innerHTML=`<span>${label}: <b id="val-${key}">${params[key]}</b> ${unit}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${params[key]}">`;
    el.querySelector('input').addEventListener('input',e=>{params[key]=Number(e.target.value); document.getElementById(`val-${key}`).textContent=params[key]; render();});
    box.appendChild(el);
  });
}
function drawPlot(data,best){
  const svg=document.getElementById('plot'), W=900,H=420,m={l:70,r:26,t:24,b:60}; svg.innerHTML='';
  const xs=data.map(d=>d.length*1000), ys=data.map(d=>d.B*1000);
  const xmin=Math.min(...xs), xmax=Math.max(...xs), ymin=0, ymax=Math.max(...ys)*1.08 || 1;
  const X=x=>m.l+(x-xmin)/(xmax-xmin)*(W-m.l-m.r);
  const Y=y=>H-m.b-(y-ymin)/(ymax-ymin)*(H-m.t-m.b);
  for(let i=0;i<=5;i++){
    const x=m.l+i*(W-m.l-m.r)/5, xv=xmin+i*(xmax-xmin)/5;
    const y=m.t+i*(H-m.t-m.b)/5, yv=ymax-i*(ymax-ymin)/5;
    svg.insertAdjacentHTML('beforeend',`<line class="gridline" x1="${x}" y1="${m.t}" x2="${x}" y2="${H-m.b}"/><text class="tick" x="${x-18}" y="${H-m.b+24}">${xv.toFixed(0)}</text>`);
    svg.insertAdjacentHTML('beforeend',`<line class="gridline" x1="${m.l}" y1="${y}" x2="${W-m.r}" y2="${y}"/><text class="tick" x="12" y="${y+4}">${yv.toFixed(3)}</text>`);
  }
  const path=data.map((d,i)=>`${i?'L':'M'}${X(d.length*1000).toFixed(2)},${Y(d.B*1000).toFixed(2)}`).join(' ');
  svg.insertAdjacentHTML('beforeend',`<line class="axis" x1="${m.l}" y1="${H-m.b}" x2="${W-m.r}" y2="${H-m.b}"/><line class="axis" x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${H-m.b}"/><path class="curve" d="${path}"/><circle class="point" cx="${X(best.length*1000)}" cy="${Y(best.B*1000)}" r="6"/><text class="label" x="${W/2-30}" y="${H-18}">l, мм</text><text class="label" transform="translate(20 ${H/2+30}) rotate(-90)">B, мТл</text>`);
}
function render(){
  if(params.lMin>=params.lMax) params.lMin=params.lMax-1;
  const data=makeData(), best=data.reduce((a,b)=>b.B>a.B?b:a,data[0]);
  document.getElementById('bestLength').textContent=`l = ${(best.length*1000).toFixed(1)} мм`;
  document.getElementById('bestB').textContent=`B = ${(best.B*1000).toFixed(4)} мТл`;
  document.getElementById('bestN').textContent=`N = ${best.N} витков, слоёв = ${best.layers}`;
  document.getElementById('bestL').textContent=`Оценка индуктивности: ${(best.Lcoil*1000).toFixed(3)} мГн`;
  drawPlot(data,best);
}
renderControls(); render();
