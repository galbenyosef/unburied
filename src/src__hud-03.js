// src__hud 03 — css
// Lines 470-780 of readable/src__hud.pretty.js (statement-aligned).
const CSS = `
.ub-root{position:fixed;inset:0;pointer-events:none;z-index:20;overflow:hidden;
  --blood:#a3120e;--blood-hi:#c8261c;--blood-dk:#4c0605;--bone:#e8dfca;--bone-dim:#b9ae96;--ink:#0a0908;
  --gold:#f0c95a;--gold-dk:#a47a1c;--purple:#b77dff;--green:#b7f26a;
  --f-stencil:'Stardos Stencil','Stencil Std','Stencil',Impact,'Arial Narrow Bold',sans-serif;
  --f-type:'Special Elite','American Typewriter','Courier New',Courier,monospace;
  --f-cond:'Oswald','Bebas Neue','Arial Narrow','Helvetica Neue Condensed',Impact,sans-serif;
  font-size:clamp(11px,calc(0.62vw + 0.42vh),22px);color:var(--bone);font-family:var(--f-cond);
  -webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none;line-height:1.2}
.ub-root *{box-sizing:border-box}
.ub-root button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:left}
.ub-defs{position:absolute;width:0;height:0;overflow:hidden}

/* ---------- layers ---------- */
.ub-fx,.ub-hud{position:absolute;inset:0;pointer-events:none;transition:opacity .45s}
.ub-hud.off,.ub-fx.off{opacity:0}
.ub-screen{position:absolute;inset:0;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .5s,visibility 0s linear .5s}
.ub-screen.on{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .5s,visibility 0s}
.ub-grain{position:absolute;inset:-50%;background-image:var(--tx-noise);background-size:192px;opacity:.16;mix-blend-mode:overlay;
  animation:ub-grain .6s steps(1) infinite;pointer-events:none}
@keyframes ub-grain{0%{transform:translate(0,0)}17%{transform:translate(-7%,4%)}33%{transform:translate(5%,-9%)}50%{transform:translate(-3%,8%)}67%{transform:translate(9%,2%)}83%{transform:translate(-8%,-5%)}}
.ub-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 70% at 50% 50%,transparent 45%,rgba(0,0,0,.72) 100%)}

/* ---------- painted strokes ---------- */
.ub-paint{display:block;overflow:visible;color:var(--blood)}
.ub-paint .ub-stroke{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 2;stroke-dashoffset:1;opacity:0;
  animation:ub-paint .32s cubic-bezier(.35,.05,.3,1) both}
.ub-paint .ub-stroke-hi{stroke:rgba(255,160,140,.32);animation-name:ub-paint-hi}
.ub-paint .ub-drip{fill:none;stroke:currentColor;stroke-linecap:round;stroke-dasharray:1 2;stroke-dashoffset:1;animation:ub-drip 1.6s cubic-bezier(.2,.6,.3,1) both}
.ub-paint .ub-bulb{fill:currentColor;animation:ub-bulb 1.6s cubic-bezier(.2,.6,.3,1) both}
.ub-paint .ub-inst{animation:none!important;stroke-dashoffset:0;opacity:1;transform-box:view-box}
.ub-paint .ub-bulb.ub-inst{transform:translateY(var(--len))}
@keyframes ub-paint{0%{stroke-dashoffset:1;opacity:0}1%{opacity:1}100%{stroke-dashoffset:0;opacity:1}}
@keyframes ub-paint-hi{0%{stroke-dashoffset:1;opacity:0}1%{opacity:1}100%{stroke-dashoffset:0;opacity:1}}
@keyframes ub-drip{0%{stroke-dashoffset:1}100%{stroke-dashoffset:0}}
@keyframes ub-bulb{0%{transform:translateY(0);opacity:0}8%{opacity:1}100%{transform:translateY(var(--len));opacity:1}}

/* ---------- round ---------- */
.ub-bl{position:absolute;left:clamp(14px,2.6vw,56px);bottom:clamp(12px,2.6vh,44px);display:flex;flex-direction:column;align-items:flex-start;gap:.7em}
.ub-round{position:relative;height:10.5em;min-width:8em;filter:drop-shadow(0 0 .5em rgba(110,0,0,.45)) drop-shadow(.12em .18em 0 rgba(0,0,0,.55))}
.ub-round .ub-paint{position:absolute;left:0;bottom:0;height:100%;width:auto}
.ub-round .ub-paint.out{animation:ub-throb-out 2.9s ease-in-out forwards}
.ub-round .ub-paint.throb{animation:ub-throb 2.3s ease-in-out}
@keyframes ub-throb-out{0%{color:var(--blood)}14%{color:#fff}30%{color:var(--blood-hi)}46%{color:#fff}62%{color:var(--blood-hi)}74%{color:#fff;opacity:1}100%{color:#fff;opacity:0}}
@keyframes ub-throb{0%{color:var(--blood)}18%{color:#fff}38%{color:var(--blood-hi)}58%{color:#fff}80%{color:var(--blood-hi)}100%{color:var(--blood)}}

/* ---------- perks ---------- */
.ub-perks{display:flex;gap:.45em;min-height:3.4em;align-items:flex-end}
.ub-perk{width:3.4em;height:3.4em;filter:drop-shadow(0 .15em .25em rgba(0,0,0,.7));animation:ub-cap-in .6s cubic-bezier(.2,1.6,.4,1) both}
.ub-perk svg{width:100%;height:100%;display:block;overflow:visible}
.ub-perk .f{fill:#f4ead3}.ub-perk .k{fill:none;stroke:rgba(0,0,0,.55);stroke-linecap:round;stroke-linejoin:round}.ub-perk .k0{fill:rgba(0,0,0,.45)}
.ub-perk .s{fill:none;stroke:#f4ead3;stroke-linecap:round;stroke-linejoin:round}
@keyframes ub-cap-in{0%{transform:scale(2.2) rotate(-40deg);opacity:0}60%{opacity:1}100%{transform:none;opacity:1}}

/* ---------- bottom right: points + ammo ---------- */
.ub-corner-shade{position:absolute;width:48vw;height:40vh;pointer-events:none}
.ub-corner-shade.l{left:0;bottom:0;background:radial-gradient(ellipse at 0 100%,rgba(0,0,0,.55),transparent 65%)}
.ub-corner-shade.r{right:0;bottom:0;background:radial-gradient(ellipse at 100% 100%,rgba(0,0,0,.6),transparent 65%)}
.ub-br{position:absolute;right:clamp(14px,2.6vw,56px);bottom:clamp(12px,2.6vh,44px);display:flex;flex-direction:column;align-items:flex-end;gap:.9em}
.ub-points-wrap{position:relative;padding:.1em .7em .1em 1.6em}
.ub-points-wrap::before{content:"";position:absolute;inset:-.2em -.4em -.2em -.2em;background:var(--tx-smear-dark) no-repeat center/100% 100%;transform:scaleX(-1);opacity:.9}
.ub-points{position:relative;font-family:var(--f-cond);font-weight:600;font-size:2.35em;letter-spacing:.02em;color:var(--gold);
  text-shadow:0 0 .35em rgba(240,180,60,.35),0 .06em 0 #3a2400,0 0 .08em #000}
.ub-points.bump{animation:ub-bump .25s ease-out}
@keyframes ub-bump{0%{transform:scale(1.12)}100%{transform:scale(1)}}
.ub-pops{position:absolute;left:1.2em;top:50%;width:0;height:0}
.ub-pop{position:absolute;left:0;top:0;transform:translate(-50%,-50%);font-family:var(--f-cond);font-weight:700;font-size:1.45em;white-space:nowrap;
  color:var(--gold);text-shadow:0 0 .3em rgba(255,190,60,.55),0 .06em .02em #000;will-change:transform,opacity}
.ub-pop.neg{color:#ff3b2f;text-shadow:0 0 .3em rgba(255,40,20,.5),0 .06em .02em #000}
.ub-ammo{display:flex;flex-direction:column;align-items:flex-end;gap:.15em}
.ub-wname{font-family:var(--f-stencil);font-weight:700;font-size:1.25em;letter-spacing:.14em;color:var(--bone);text-shadow:0 .08em .1em #000;text-transform:uppercase}
.ub-wname.up{color:#e9d8ff;text-shadow:0 0 .35em rgba(170,90,255,.95),0 0 .9em rgba(140,60,255,.6),0 .08em .1em #000;animation:ub-pap 2.4s ease-in-out infinite}
@keyframes ub-pap{50%{text-shadow:0 0 .55em rgba(190,120,255,1),0 0 1.4em rgba(120,200,255,.55),0 .08em .1em #000}}
.ub-ammo-row{display:flex;align-items:baseline;gap:.25em;font-family:var(--f-cond);line-height:1}
.ub-mag{font-size:3.4em;font-weight:600;color:var(--bone);text-shadow:0 .05em .1em #000;min-width:1.2em;text-align:right;font-variant-numeric:tabular-nums}
.ub-mag.low{color:#ff4a36;animation:ub-lowmag .7s ease-in-out infinite}
.ub-mag.empty{color:#ff2a1a}
@keyframes ub-lowmag{50%{opacity:.45;text-shadow:0 0 .35em rgba(255,40,20,.9)}}
.ub-slash{font-size:2em;color:var(--bone-dim);opacity:.6;transform:skewX(-12deg)}
.ub-res{font-size:1.75em;font-weight:500;color:var(--bone-dim);font-variant-numeric:tabular-nums;text-shadow:0 .05em .1em #000}
.ub-res.zero{color:#b13a2c}
.ub-ticks{display:flex;gap:2px;height:.55em;justify-content:flex-end;max-width:16em;flex-wrap:nowrap}
.ub-ticks i{width:.28em;height:100%;background:var(--bone);opacity:.85;box-shadow:0 0 2px #000;transform:skewX(-14deg)}
.ub-ticks i.gone{opacity:.14}
.ub-ticks.bar{width:10em;height:.3em;background:rgba(232,223,202,.14);position:relative}
.ub-ticks.bar b{position:absolute;right:0;top:0;bottom:0;background:var(--bone);opacity:.85}
.ub-nades{display:flex;gap:.3em;margin-top:.25em;height:1.5em}
.ub-nade{width:1.1em;height:1.5em;opacity:.95;filter:drop-shadow(0 .05em .08em #000)}
.ub-nade.empty{opacity:.18}
.ub-nade svg{width:100%;height:100%;display:block}

/* ---------- powerups ---------- */
.ub-pu{position:absolute;left:50%;bottom:clamp(12px,3vh,48px);transform:translateX(-50%);display:flex;gap:1.1em}
.ub-pu-i{display:flex;flex-direction:column;align-items:center;gap:.25em;animation:ub-cap-in .5s cubic-bezier(.2,1.5,.4,1) both}
.ub-pu-ic{width:3.5em;height:3.5em;border-radius:50%;background:radial-gradient(circle,rgba(190,255,110,.35),rgba(80,160,30,.18) 55%,transparent 72%);
  display:grid;place-items:center;filter:drop-shadow(0 0 .35em rgba(170,255,90,.6))}
.ub-pu-ic svg{width:78%;height:78%;overflow:visible}
.ub-pu-ic .f{fill:#e3ffb4}.ub-pu-ic .k{fill:none;stroke:rgba(20,50,0,.8);stroke-width:1.3;stroke-linecap:round}.ub-pu-ic .k0{fill:rgba(20,50,0,.85)}
.ub-pu-ic .s{fill:none;stroke:#e3ffb4;stroke-linecap:round}
.ub-pu-ic .t{fill:#e3ffb4;font-family:var(--f-cond);font-weight:700;font-size:21px}
.ub-pu-t{font-family:var(--f-type);font-size:.95em;color:#dff7c0;text-shadow:0 0 .3em #000,0 0 .1em #000}
.ub-pu-i.blink .ub-pu-ic{animation:ub-blink .5s steps(1) infinite}
.ub-pu-i.blink.fast .ub-pu-ic{animation-duration:.22s}
@keyframes ub-blink{50%{opacity:.15}}

/* ---------- centre: crosshair / hitmarker / hints / prompt ---------- */
.ub-cross{position:absolute;left:50%;top:50%;width:0;height:0;transition:opacity .12s}
.ub-cross.off{opacity:0}
.ub-cross i{position:absolute;background:rgba(245,240,228,.92);box-shadow:0 0 0 1px rgba(0,0,0,.45);border-radius:1px}
.ub-cross i.v{width:2px;height:.75em;left:-1px}.ub-cross i.hz{height:2px;width:.75em;top:-1px}
.ub-cross .dot{width:2px;height:2px;left:-1px;top:-1px;opacity:.7}
.ub-hit{position:absolute;left:50%;top:50%;width:2.8em;height:2.8em;margin:-1.4em 0 0 -1.4em;opacity:0}
.ub-hit svg{width:100%;height:100%;overflow:visible}
.ub-hit path{stroke:#fff;stroke-width:2.6;stroke-linecap:square;filter:drop-shadow(0 0 1px #000)}
.ub-hit.kill path{stroke:#ff3a2a}
.ub-hit.head{width:3.8em;height:3.8em;margin:-1.9em 0 0 -1.9em}
.ub-hit.head path{stroke:#ff2a1a;stroke-width:3.2}
.ub-hit.pop{animation:ub-hit .32s ease-out}
.ub-hit.head.pop{animation-duration:.42s}
@keyframes ub-hit{0%{opacity:1;transform:scale(1.55)}25%{opacity:1;transform:scale(.92)}60%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.05)}}
.ub-hint{position:absolute;left:50%;top:calc(50% + 4.2em);transform:translateX(-50%);font-family:var(--f-stencil);font-weight:700;font-size:1.25em;letter-spacing:.35em;
  padding-left:.35em;color:var(--bone);text-shadow:0 0 .4em #000,0 .08em .1em #000;opacity:0;transition:opacity .15s}
.ub-hint.on{opacity:1;animation:ub-hintp 1s ease-in-out infinite}
.ub-hint.red{color:#ff4030}
@keyframes ub-hintp{50%{opacity:.35}}
.ub-prompt{position:absolute;left:50%;top:64%;transform:translateX(-50%);font-family:var(--f-type);font-size:1.3em;color:var(--bone);white-space:nowrap;
  padding:.45em 1.3em .5em;opacity:0;transition:opacity .15s;text-shadow:0 .06em .15em #000,0 0 .4em rgba(0,0,0,.8)}
.ub-prompt::before{content:"";position:absolute;inset:0 -1.2em;background:radial-gradient(ellipse 50% 50% at 50% 50%,rgba(0,0,0,.6),transparent 100%);z-index:-1}
.ub-prompt.on{opacity:1}
.ub-prompt .cost{color:var(--gold)}
.ub-key{display:inline-block;min-width:1.7em;padding:.08em .38em .02em;margin:0 .2em;border-radius:.2em;font-family:var(--f-cond);font-weight:600;font-size:.9em;text-align:center;
  color:#1a1510;background:linear-gradient(#f2e9d4,#c9bc9d);box-shadow:0 .14em 0 #6d624d,0 .2em .3em rgba(0,0,0,.6),inset 0 1px 0 #fff8e8;vertical-align:.08em;text-shadow:none;letter-spacing:.02em}

/* ---------- banner / message ---------- */
.ub-banner{position:absolute;left:50%;top:11%;transform:translateX(-50%);text-align:center;pointer-events:none}
.ub-banner .t{font-family:var(--f-stencil);font-weight:700;font-size:4.2em;letter-spacing:.08em;line-height:1;color:var(--bone);white-space:nowrap;
  text-shadow:0 0 .12em rgba(255,210,120,.6),0 0 .5em rgba(230,150,40,.45),.04em .06em 0 #2a0400;filter:url(#ub-distress)}
.ub-banner .sb{font-family:var(--f-type);font-size:1.2em;letter-spacing:.25em;margin-top:.4em;color:#e9d9b5;text-shadow:0 0 .3em #000}
.ub-banner .ink{position:absolute;left:50%;top:48%;width:150%;height:130%;transform:translate(-50%,-50%);background:var(--tx-smear-dark) no-repeat center/100% 100%;opacity:.75;z-index:-1}
.ub-banner.go{animation:ub-slam 3.2s cubic-bezier(.2,.8,.2,1) both}
@keyframes ub-slam{0%{opacity:0;transform:translateX(-50%) scale(2.6) rotate(-4deg)}9%{opacity:1;transform:translateX(-50%) scale(.93) rotate(-1.5deg)}
  14%{transform:translateX(-50%) scale(1.03) rotate(-1deg)}19%{transform:translateX(-50%) scale(1) rotate(-1deg)}82%{opacity:1;transform:translateX(-50%) scale(1) rotate(-1deg)}
  100%{opacity:0;transform:translateX(-50%) translateY(-.6em) scale(1.02) rotate(-1deg)}}
.ub-msg{position:absolute;left:clamp(14px,2.6vw,56px);top:clamp(14px,4vh,60px);max-width:min(30em,70vw);padding:.7em 1.1em .75em 1.2em;
  font-family:var(--f-type);font-size:1.02em;color:#1d1812;background:var(--tx-paper) center/320px;opacity:0;transform:translateX(-1em) rotate(-.6deg);
  transition:opacity .35s,transform .35s;box-shadow:0 .3em .8em rgba(0,0,0,.55)}
.ub-msg.on{opacity:.94;transform:rotate(-.6deg)}
.ub-msg::after{content:"";display:inline-block;width:.5em;height:1em;background:#1d1812;margin-left:.1em;vertical-align:-.12em;animation:ub-caret .8s steps(1) infinite}
.ub-msg.done::after{display:none}
.ub-msg .tag{display:block;font-family:var(--f-stencil);font-weight:700;font-size:.72em;letter-spacing:.3em;color:#8b150f;margin-bottom:.2em}
@keyframes ub-caret{50%{opacity:0}}

/* ---------- damage / health / downed ---------- */
.ub-hurt{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 80% 75% at 50% 50%,transparent 38%,rgba(120,0,0,.5) 78%,rgba(60,0,0,.92) 100%);transition:opacity .4s}
.ub-hurt-sp{position:absolute;inset:0;opacity:0;transition:opacity .6s}
.ub-hurt-sp b{position:absolute;width:62vmin;height:62vmin;background-size:100% 100%;transform:translate(-50%,-50%)}
.ub-splat{position:absolute;background-size:100% 100%;transform:translate(-50%,-50%);opacity:0;will-change:opacity,transform}
.ub-flash{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(170,0,0,.55));opacity:0}
.ub-downed{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .8s,visibility 0s linear .8s;
  backdrop-filter:grayscale(.85) contrast(1.08) brightness(.8);-webkit-backdrop-filter:grayscale(.85) contrast(1.08) brightness(.8)}
.ub-downed.on{opacity:1;visibility:visible;transition:opacity .8s,visibility 0s}
.ub-downed::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 70% 65% at 50% 50%,rgba(120,0,0,.25),rgba(70,0,0,.85));mix-blend-mode:multiply;animation:ub-beat 1.1s ease-in-out infinite}
@keyframes ub-beat{0%,100%{opacity:.85}12%{opacity:1}24%{opacity:.8}36%{opacity:1}}
.ub-bleed{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:.6em}
.ub-bleed svg{width:7em;height:7em;overflow:visible}
.ub-bleed .bg{fill:none;stroke:rgba(0,0,0,.5);stroke-width:7}
.ub-bleed .ring{fill:none;stroke:#c41a12;stroke-width:5;stroke-linecap:round;transform:rotate(-90deg);transform-origin:center;filter:drop-shadow(0 0 4px rgba(255,30,10,.7))}
.ub-bleed .lbl{font-family:var(--f-stencil);font-weight:700;letter-spacing:.4em;font-size:1.3em;color:#f0d6cc;text-shadow:0 0 .4em #000;padding-left:.4em}
.ub-bleed .sub{font-family:var(--f-type);font-size:.95em;color:#d8b8ad;opacity:.8}

/* ---------- menus shared ---------- */
.ub-item{position:relative;display:block;padding:.18em 0 .22em;font-family:var(--f-cond);font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--bone-dim);outline:none;width:max-content}
.ub-item .lbl{position:relative;z-index:1;display:inline-block;transition:transform .28s cubic-bezier(.2,.8,.2,1),color .2s,text-shadow .2s;text-shadow:0 .05em .1em #000}
.ub-item .smear{position:absolute;left:-.25em;right:-.6em;bottom:.12em;height:.52em;background:var(--tx-smear) no-repeat left center/100% 100%;
  clip-path:inset(0 100% 0 0);transition:clip-path .38s cubic-bezier(.3,.7,.2,1),transform .28s cubic-bezier(.2,.8,.2,1);opacity:.95}
.ub-item::before{content:"";position:absolute;left:-.9em;top:50%;width:.45em;height:.14em;margin-top:-.06em;background:var(--blood-hi);transform:scaleX(0);transform-origin:left;transition:transform .25s}
.ub-item.is-sel{color:#fff}
.ub-item.is-sel .lbl{transform:translateX(.55em);text-shadow:0 0 .4em rgba(255,60,40,.35),0 .05em .1em #000}
.ub-item.is-sel .smear{clip-path:inset(0 0 0 0);transform:translateX(.55em)}
.ub-item.is-sel::before{transform:scaleX(1)}
.ub-item.dis{opacity:.35}

/* ---------- loading ---------- */
.ub-loading{background:#070605;z-index:30;display:grid;place-items:center}
.ub-loading .inner{position:relative;width:min(40em,86vw);text-align:center}
.ub-load-title{font-family:var(--f-stencil);font-weight:700;font-size:4.8em;letter-spacing:.12em;color:var(--bone);line-height:1;filter:url(#ub-distress);
  text-shadow:0 0 .25em rgba(160,10,5,.55),.03em .05em 0 #3a0000;padding-left:.12em}
.ub-load-sub{font-family:var(--f-type);letter-spacing:.55em;font-size:1em;color:#a99b82;margin:.9em 0 3em;padding-left:.55em}
.ub-fuse{position:relative;height:1.1em;margin:0 1em}
.ub-fuse .rope{position:absolute;top:50%;height:.42em;margin-top:-.21em;left:0;right:0;border-radius:.2em;
  background:repeating-linear-gradient(115deg,#8a7152 0 .22em,#5b4631 .22em .34em,#a38a67 .34em .52em);box-shadow:0 .08em .12em #000,inset 0 .08em .05em rgba(255,240,200,.2)}
.ub-fuse .burnt{position:absolute;top:50%;height:.3em;margin-top:-.15em;left:0;width:0;border-radius:.15em;
  background:linear-gradient(90deg,#1a1512,#2a211b 70%,#6b2a0c 94%,#ff8a2a);box-shadow:0 0 .4em rgba(255,110,20,.25)}
.ub-fuse .cov{position:absolute;inset:0;right:auto;width:0;background:#070605}
.ub-fuse .spark{position:absolute;top:50%;left:0;width:0;height:0}
.ub-fuse .spark::before{content:"";position:absolute;width:2.4em;height:2.4em;left:-1.2em;top:-1.2em;border-radius:50%;
  background:radial-gradient(circle,#fff6c8 0,#ffc347 18%,rgba(255,110,20,.55) 38%,transparent 70%);animation:ub-fl .09s steps(2) infinite alternate}
.ub-fuse .spark i{position:absolute;width:3px;height:3px;border-radius:50%;background:#ffd07a;box-shadow:0 0 4px #ff8a20;animation:ub-sp .7s ease-out infinite}
@keyframes ub-fl{to{transform:scale(.8);opacity:.85}}
@keyframes ub-sp{0%{transform:translate(0,0);opacity:1}100%{transform:translate(var(--dx),var(--dy));opacity:0}}
.ub-load-row{display:flex;justify-content:space-between;margin:1.3em 1em 0;font-family:var(--f-type);font-size:.95em;color:#bfb196}
.ub-load-pct{color:var(--gold);font-variant-numeric:tabular-nums}
.ub-load-flav{margin-top:3.2em;min-height:3em;font-family:var(--f-type);font-size:1em;color:#8f846f;line-height:1.5;transition:opacity .6s;font-style:normal}
.ub-load-flav.fade{opacity:0}

/* ---------- main menu ---------- */
.ub-menu{z-index:10}
.ub-menu .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(6,5,4,.94) 0%,rgba(6,5,4,.82) 30%,rgba(6,5,4,.35) 58%,rgba(6,5,4,0) 80%),
  linear-gradient(0deg,rgba(0,0,0,.6),transparent 30%)}
.ub-menu .panel{position:absolute;left:clamp(20px,7vw,160px);top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;max-width:min(46em,90vw)}
.ub-kicker{font-family:var(--f-type);font-size:.95em;letter-spacing:.35em;color:#9a2b20;margin-bottom:.4em;padding-left:.2em}
.ub-title{margin:0;font-family:var(--f-stencil);font-weight:700;font-size:clamp(3.2rem,9.6vw,13rem);line-height:.9;letter-spacing:.02em;color:#e3d7bd;
  text-shadow:0 0 .04em rgba(255,240,210,.35),0 0 .22em rgba(150,8,4,.55),.03em .05em 0 #3b0402,0 0 .6em rgba(0,0,0,.8);filter:url(#ub-distress);
  animation:ub-bulb-flick 9s linear infinite;white-space:nowrap}
@keyframes ub-bulb-flick{0%,19%,21.5%,23%,62%,64%,100%{opacity:1}20%,22.5%{opacity:.55}63%{opacity:.78}
  40%{opacity:1;text-shadow:0 0 .04em rgba(255,240,210,.35),0 0 .3em rgba(170,10,4,.7),.03em .05em 0 #3b0402,0 0 .6em rgba(0,0,0,.8)}}
.ub-subtitle{display:flex;align-items:center;white-space:nowrap;width:max-content;gap:.8em;margin:.55em 0 0 .15em;font-family:var(--f-stencil);font-weight:700;font-size:clamp(1rem,1.7vw,2.1rem);letter-spacing:.42em;color:#b4a88f}
.ub-subtitle .rule{flex:0 0 2.2em;height:2px;background:linear-gradient(90deg,transparent,var(--blood))}
.ub-subtitle .rule:last-child{background:linear-gradient(90deg,var(--blood),transparent)}
.ub-items{margin-top:clamp(1.6em,6vh,4.5em);display:flex;flex-direction:column;gap:.1em;padding-left:.9em}
.ub-items .ub-item{font-size:clamp(1.8rem,2.9vw,3.9rem)}
.ub-desc{height:1.6em;margin:1.1em 0 0 .95em;font-family:var(--f-type);font-size:1em;color:#948a76;letter-spacing:.04em}
.ub-foot{position:absolute;bottom:clamp(14px,3.5vh,40px);left:0;display:flex;gap:1.6em;font-family:var(--f-type);font-size:.85em;color:#6f675a;white-space:nowrap}
.ub-foot .ub-key{font-size:.85em}
.ub-ver{position:absolute;right:clamp(14px,2.5vw,40px);bottom:clamp(14px,3.5vh,40px);font-family:var(--f-type);font-size:.8em;color:rgba(200,190,170,.4);letter-spacing:.2em}

/* ---------- paper panels (settings / controls) ---------- */
.ub-sheet{z-index:14;background:rgba(0,0,0,.35)}
.ub-sheet .paper{position:absolute;right:clamp(16px,6vw,140px);top:50%;width:min(36em,92vw);max-height:92vh;overflow:auto;transform:translateY(-50%) rotate(.6deg);
  padding:2.2em 2.5em 2em;color:#1c1712;font-family:var(--f-type);background:var(--tx-paper) center/420px,#cdbf9f;
  box-shadow:0 1.2em 3em rgba(0,0,0,.7);scrollbar-width:none}
.ub-sheet .paper::-webkit-scrollbar{display:none}
.ub-sheet.on .paper{animation:ub-sheet-in .45s cubic-bezier(.2,.9,.25,1) both}
@keyframes ub-sheet-in{0%{transform:translateY(-46%) translateX(3em) rotate(3deg);opacity:0}100%{transform:translateY(-50%) rotate(.6deg);opacity:1}}
.ub-sheet .paper::before{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 4em rgba(90,60,20,.45)}
.ub-sheet h2{margin:0;font-family:var(--f-stencil);font-weight:700;font-size:2.5em;letter-spacing:.1em;line-height:1;color:#1c1712}
.ub-sheet .form{font-size:.8em;letter-spacing:.2em;color:#5b4c3a;margin:.4em 0 1.2em;display:flex;justify-content:space-between;border-bottom:2px solid #2a221a;padding-bottom:.6em}
.ub-stamp{position:absolute;right:1.6em;top:1.5em;font-family:var(--f-stencil);font-weight:700;font-size:1.05em;letter-spacing:.2em;color:rgba(160,20,14,.8);
  border:.16em solid rgba(160,20,14,.75);padding:.15em .5em .1em;transform:rotate(-9deg);filter:url(#ub-distress);mix-blend-mode:multiply}
.ub-row{display:grid;grid-template-columns:1fr 12em 3.6em;align-items:center;gap:.9em;padding:.55em .5em;margin:0 -.5em;border-bottom:1px dashed rgba(60,45,30,.35);position:relative}
.ub-row .nm{font-size:1.02em;letter-spacing:.06em;text-transform:uppercase}
.ub-row .val{text-align:right;font-variant-numeric:tabular-nums;color:#6a160f}
.ub-row.is-sel{background:rgba(140,20,10,.1)}
.ub-row.is-sel::before{content:"";position:absolute;left:-.9em;top:50%;border:.38em solid transparent;border-left:.5em solid #8b150f;transform:translateY(-50%)}
.ub-range{-webkit-appearance:none;appearance:none;width:100%;height:1.4em;background:transparent;cursor:pointer;margin:0;
  --p:50%}
.ub-range::-webkit-slider-runnable-track{height:.28em;background:linear-gradient(90deg,#8b150f 0 var(--p),rgba(40,30,20,.35) var(--p) 100%);border-radius:.1em}
.ub-range::-moz-range-track{height:.28em;background:linear-gradient(90deg,#8b150f 0 var(--p),rgba(40,30,20,.35) var(--p) 100%)}
.ub-range::-webkit-slider-thumb{-webkit-appearance:none;width:.8em;height:1.35em;margin-top:-.54em;border-radius:.15em;
  background:linear-gradient(90deg,#8a6a2a,#e7c46e 45%,#9a7630);box-shadow:0 .1em .2em rgba(0,0,0,.6);border:1px solid #4a3510}
.ub-range::-moz-range-thumb{width:.8em;height:1.35em;border-radius:.15em;background:linear-gradient(90deg,#8a6a2a,#e7c46e 45%,#9a7630);border:1px solid #4a3510}
.ub-seg{display:flex;border:2px solid #2a221a;grid-column:2 / 4}
.ub-seg button{flex:1;text-align:center;padding:.3em 0 .2em;font-family:var(--f-stencil);font-weight:700;letter-spacing:.14em;font-size:.95em;color:#2a221a}
.ub-seg button.act{background:#2a221a;color:#e8dcc0}
.ub-sheet .back{margin-top:1.5em;font-family:var(--f-stencil);font-weight:700;font-size:1.35em;letter-spacing:.2em;color:#1c1712;padding:.2em .1em}
.ub-sheet .back.is-sel{color:#8b150f}
.ub-sheet .back .ub-key{font-size:.65em;margin-left:.8em;vertical-align:.25em}
.ub-ctl{display:grid;grid-template-columns:1fr auto;gap:.1em 1.5em;align-items:center}
.ub-ctl .a{font-size:1.02em;text-transform:uppercase;letter-spacing:.06em;padding:.42em 0;border-bottom:1px dashed rgba(60,45,30,.35)}
.ub-ctl .k{text-align:right;padding:.3em 0;border-bottom:1px dashed rgba(60,45,30,.35);white-space:nowrap}
.ub-ctl .k .or{font-size:.8em;color:#6a5a45;margin:0 .15em}
.ub-sheet .ub-key{font-size:.85em}

/* ---------- pause ---------- */
.ub-pause{z-index:12;background:linear-gradient(90deg,rgba(5,4,3,.9),rgba(5,4,3,.6) 55%,rgba(5,4,3,.35));backdrop-filter:blur(3px) grayscale(.4);-webkit-backdrop-filter:blur(3px) grayscale(.4)}
.ub-pause .panel{position:absolute;left:clamp(20px,7vw,160px);top:0;bottom:0;display:flex;flex-direction:column;justify-content:center}
.ub-pause h2{margin:0;font-family:var(--f-stencil);font-weight:700;font-size:clamp(3rem,6.5vw,8rem);line-height:.95;letter-spacing:.06em;color:#e3d7bd;
  text-shadow:0 0 .22em rgba(150,8,4,.5),.03em .05em 0 #3b0402;filter:url(#ub-distress)}
.ub-pause .info{font-family:var(--f-type);letter-spacing:.3em;color:#a4987f;margin:.5em 0 0 .2em;font-size:1.05em}
.ub-pause .ub-items .ub-item{font-size:clamp(1.6rem,2.4vw,3.1rem)}

/* ---------- game over ---------- */
.ub-go{z-index:16;background:radial-gradient(ellipse at 50% 45%,rgba(20,0,0,.72),rgba(0,0,0,.96) 75%);display:grid;place-items:center;transition:opacity 1.4s,visibility 0s linear 1.4s}
.ub-go.on{transition:opacity 1.4s,visibility 0s}
.ub-go .inner{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;width:min(44em,92vw)}
.ub-go .l1{font-family:var(--f-stencil);font-weight:700;font-size:2.4em;letter-spacing:.4em;padding-left:.4em;color:var(--bone);opacity:0;text-shadow:0 0 .3em rgba(0,0,0,.9)}
.ub-go .l1.in{animation:ub-l1 1.4s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes ub-l1{0%{opacity:0;letter-spacing:1.1em;filter:blur(6px)}100%{opacity:1;letter-spacing:.4em;filter:blur(0)}}
.ub-go .rn{height:11em;margin:.6em 0 .2em;filter:drop-shadow(0 0 .7em rgba(140,0,0,.55))}
.ub-go .rn .ub-paint{height:100%;width:auto}
.ub-go .l2{font-family:var(--f-stencil);font-weight:700;font-size:1.9em;letter-spacing:.55em;padding-left:.55em;color:#c9bca2;opacity:0;transition:opacity .9s}
.ub-go .l2.in{opacity:1}
.ub-go .stats{margin-top:2.2em;width:min(27em,88vw);font-family:var(--f-type);font-size:1.12em;color:#d8ccb2}
.ub-go .st{display:flex;align-items:baseline;gap:.4em;padding:.18em 0;min-height:1.6em}
.ub-go .st .k{white-space:nowrap}
.ub-go .st .dots{flex:1;border-bottom:2px dotted rgba(200,185,160,.35);transform:translateY(-.25em);opacity:0;transition:opacity .3s}
.ub-go .st.full .dots{opacity:1}
.ub-go .st .v{color:var(--gold);white-space:nowrap}
.ub-go .btns{display:flex;gap:3em;margin-top:2.4em;opacity:0;transform:translateY(.6em);transition:opacity .6s,transform .6s}
.ub-go .btns.in{opacity:1;transform:none}
.ub-go .btns .ub-item{font-size:2em}
.ub-go .skip{position:absolute;bottom:-4em;font-family:var(--f-type);font-size:.8em;color:#5d554a;letter-spacing:.2em}

/* ---------- responsive ---------- */
@media (max-width:760px){
  .ub-menu .shade{background:linear-gradient(0deg,rgba(6,5,4,.95) 0%,rgba(6,5,4,.8) 55%,rgba(6,5,4,.55) 100%)}
  .ub-menu .panel,.ub-pause .panel{left:18px;right:18px;max-width:none;justify-content:flex-end;padding-bottom:18vh}
  .ub-title{font-size:clamp(2.6rem,15vw,5rem)}
  .ub-subtitle{letter-spacing:.25em}
  .ub-foot{display:none}
  .ub-sheet .paper{right:50%;transform:translate(50%,-50%);padding:1.6em 1.3em}
  .ub-sheet.on .paper{animation:none;transform:translate(50%,-50%)}
  .ub-row{grid-template-columns:1fr 3.4em;grid-template-areas:"n v" "r r"}
  .ub-row .nm{grid-area:n}.ub-row .val{grid-area:v}.ub-row .ub-range{grid-area:r}.ub-row .ub-seg{grid-area:r}
  .ub-go .btns{gap:1.6em}
  .ub-banner .t{font-size:2.6em}
  .ub-prompt{font-size:1.05em;white-space:normal;width:90vw;text-align:center}
}
`;

// ---------------------------------------------------------------- co-op style (phase 2)
