// src__hud 04 — replace
// Lines 781-1119 of readable/src__hud.pretty.js (statement-aligned).
const CSS_COOP = `
/* ---------- team score list (bottom-right, above local points) ---------- */
.ub-team{display:flex;flex-direction:column;align-items:flex-end;gap:.05em;margin-bottom:-.55em;padding-right:.7em}
.ub-tm{display:flex;align-items:center;gap:.5em;transition:opacity .6s,transform .5s;animation:ub-fd-in .4s ease-out both}
.ub-tm .nm{font-family:var(--f-type);font-size:.78em;color:var(--c);opacity:.8;max-width:9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 2px #000,0 0 .3em #000}
.ub-tm .pt{font-family:var(--f-cond);font-weight:600;font-size:1.6em;line-height:1.1;color:var(--c);min-width:2.6em;text-align:right;font-variant-numeric:tabular-nums;
  text-shadow:0 0 .3em rgba(0,0,0,.85),0 .06em 0 rgba(0,0,0,.8)}
.ub-medic{width:1em;height:1em;display:none;flex:0 0 auto;filter:drop-shadow(0 0 .2em rgba(255,20,10,.6))}
.ub-tm.down .ub-medic,.ub-points-wrap.down .ub-medic{display:block;animation:ub-hintp .9s ease-in-out infinite}
.ub-tm.down .pt{color:#8d867a}
.ub-tm.down .nm{color:#e0473a;opacity:1}
.ub-tm.dc{opacity:.28}
.ub-tm.dc .nm::after{content:" \\2014 lost signal";color:#8d867a}
.ub-tm.gone{opacity:0;transform:translateX(1.2em)}
.ub-points-wrap .ub-medic{position:absolute;left:.1em;top:50%;width:1.3em;height:1.3em;margin-top:-.65em}
.ub-points-wrap.down .ub-points{color:#8d867a!important;text-shadow:0 .06em 0 #000}
.ub-points.slot{text-shadow:0 0 .35em rgba(0,0,0,.6),0 .06em 0 rgba(0,0,0,.85),0 0 .08em #000}

/* ---------- markers ---------- */
.ub-marks{position:absolute;inset:0;overflow:hidden}
.ub-mk{position:absolute;left:0;top:0;width:0;height:0;will-change:transform}
.ub-mk>*{position:absolute;left:0;top:0}
.ub-mk .plate{transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;white-space:nowrap;transform-origin:50% 100%}
.ub-mk .plate .nm{font-family:var(--f-cond);font-weight:600;font-size:.95em;letter-spacing:.08em;text-transform:uppercase;color:var(--c);
  text-shadow:0 0 .25em rgba(0,0,0,.95),0 1px 1px #000}
.ub-mk .plate .chev{width:0;height:0;border:.3em solid transparent;border-top:.36em solid var(--c);margin-top:.05em;filter:drop-shadow(0 1px 1px #000)}
.ub-mk .dn,.ub-mk .arr{display:none}
.ub-mk.down .plate{display:none}
.ub-mk.down .dn{display:flex}
.ub-mk .dn{flex-direction:column;align-items:center;transform:translate(-50%,-50%)}
.ub-mk .dn svg{width:3.2em;height:3.2em;overflow:visible}
.ub-mk .dn .bg{fill:rgba(20,0,0,.55);stroke:rgba(0,0,0,.6);stroke-width:5}
.ub-mk .dn .ring{fill:none;stroke:#d8261a;stroke-width:3.6;stroke-linecap:round;stroke-dasharray:1 1;transform:rotate(-90deg);filter:drop-shadow(0 0 3px rgba(255,40,20,.8))}
.ub-mk .dn .cross{fill:#e32a1c;stroke:#2a0000;stroke-width:1;transform-origin:center;animation:ub-cross 1s ease-in-out infinite}
.ub-mk.rev .dn .ring{stroke:#f2ead8;filter:drop-shadow(0 0 3px rgba(255,255,230,.8))}
.ub-mk.rev .dn .cross{fill:#f2ead8;animation:none}
@keyframes ub-cross{50%{transform:scale(.8);opacity:.7}}
.ub-mk .dl{margin-top:.25em;font-family:var(--f-stencil);font-weight:700;font-size:.72em;letter-spacing:.18em;color:#ffd5cc;text-shadow:0 0 .3em #000,0 1px 1px #000;white-space:nowrap}
.ub-mk .dl .who{color:var(--c)}
.ub-mk.edge .dn svg{width:2.7em;height:2.7em}
.ub-mk.edge.lab-up .dn{flex-direction:column-reverse}
.ub-mk.edge.lab-up .dl{margin:0 0 .25em}
.ub-mk.edge .arr{display:block;width:0;height:0}
.ub-mk .arr i{position:absolute;left:-.6em;top:-.65em;width:0;height:0;border-top:.65em solid transparent;border-bottom:.65em solid transparent;border-left:1.05em solid #ef3322;
  transform:translateX(2.35em);filter:drop-shadow(0 0 3px rgba(0,0,0,.9));animation:ub-arr 1s ease-in-out infinite}
@keyframes ub-arr{50%{transform:translateX(2.75em)}}

/* ---------- revive bar ---------- */
.ub-revive{position:absolute;left:50%;top:calc(50% + 7em);transform:translateX(-50%);width:19em;text-align:center;opacity:0;transition:opacity .15s}
.ub-revive.on{opacity:1}
.ub-revive .t{display:flex;align-items:center;justify-content:center;gap:.5em;font-family:var(--f-stencil);font-weight:700;letter-spacing:.2em;font-size:1.02em;
  color:var(--bone);text-shadow:0 0 .4em #000,0 1px 1px #000;margin-bottom:.5em;white-space:nowrap;text-transform:uppercase}
.ub-revive .t svg{width:1.1em;height:1.1em}
.ub-revive .bar{position:relative;height:.62em;background:rgba(0,0,0,.6);border:1px solid rgba(232,223,202,.5);padding:2px;box-shadow:0 0 .8em rgba(0,0,0,.7)}
.ub-revive .fill{height:100%;width:0;background:linear-gradient(90deg,#8e1a12,#e04a30);box-shadow:0 0 .6em rgba(255,80,40,.55)}
.ub-revive .bar::after{content:"";position:absolute;inset:2px;background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 1px),rgba(0,0,0,.55) calc(10% - 1px) 10%)}

/* ---------- feed ---------- */
.ub-feed{position:absolute;left:clamp(14px,2.6vw,56px);top:30%;display:flex;flex-direction:column;align-items:flex-start;gap:.3em;max-width:min(28em,60vw)}
.ub-fd{font-family:var(--f-type);font-size:.95em;color:#e0d5bd;padding:.28em 1.4em .26em .7em;background:linear-gradient(90deg,rgba(0,0,0,.62),rgba(0,0,0,0));
  border-left:3px solid var(--c,#a3120e);text-shadow:0 1px 2px #000;animation:ub-fd-in .35s ease-out both;transition:opacity .6s,transform .6s}
.ub-fd b{font-weight:normal}
.ub-fd.out{opacity:0;transform:translateX(-.8em)}
@keyframes ub-fd-in{from{opacity:0;transform:translateX(-1.2em)}}

/* ---------- chat ---------- */
.ub-chat{position:absolute;left:clamp(14px,2.6vw,56px);bottom:calc(clamp(12px,2.6vh,44px) + 16em);width:min(30em,64vw);display:flex;flex-direction:column;align-items:stretch;gap:.18em;
  padding:.5em .6em;margin-left:-.6em;transition:background .2s}
.ub-chat.open{background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.25) 70%,transparent)}
.ub-cl{font-family:var(--f-type);font-size:.95em;line-height:1.35;color:#ece3cf;text-shadow:0 1px 2px #000,0 0 .35em #000;transition:opacity .9s;overflow-wrap:anywhere;animation:ub-fd-in .25s ease-out both}
.ub-cl .n{color:var(--c)}
.ub-cl .n::after{content:":";color:#9e937e;margin-right:.35em}
.ub-cl.sys{color:#a99d86}
.ub-cl.old{opacity:0}
.ub-chat.open .ub-cl.old{opacity:.8}
.ub-chatin{display:none;align-items:center;gap:.6em;margin-top:.35em;padding:.4em .7em;background:rgba(10,8,6,.85);border:1px solid rgba(232,223,202,.3);border-left:3px solid var(--blood-hi)}
.ub-chat.open .ub-chatin{display:flex}
.ub-chatin .lb{font-family:var(--f-stencil);font-weight:700;letter-spacing:.22em;font-size:.78em;color:#b3a68d;white-space:nowrap}
.ub-chatin input{flex:1;min-width:0;background:none;border:0;outline:0;color:#f3ead6;font-family:var(--f-type);font-size:1em;pointer-events:auto;caret-color:#e04a30;padding:0}
.ub-chatin .ct{font-family:var(--f-type);font-size:.72em;color:#6f675a}

/* ---------- net status ---------- */
.ub-net{position:absolute;right:clamp(14px,2.6vw,56px);top:clamp(12px,2.6vh,40px);display:flex;align-items:center;gap:.5em;font-family:var(--f-type);font-size:.82em;
  color:rgba(232,223,202,.72);text-shadow:0 1px 2px #000;opacity:0;transition:opacity .3s;white-space:nowrap}
.ub-net.on{opacity:1}
.ub-net svg{width:1.2em;height:1.2em}
.ub-net .ic{fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round}
.ub-bars{display:inline-flex;align-items:flex-end;gap:2px;height:.95em;vertical-align:-.08em}
.ub-bars i{width:3px;background:rgba(232,223,202,.22)}
.ub-bars i:nth-child(1){height:30%}.ub-bars i:nth-child(2){height:55%}.ub-bars i:nth-child(3){height:78%}.ub-bars i:nth-child(4){height:100%}
.ub-bars i.on{background:#a9d47c}
.ub-bars.q2 i.on{background:#e6c14f}.ub-bars.q1 i.on{background:#ef5a3c}
.ub-net.warn{color:#ff6a52}
.ub-net.warn .ub-bars i.on{background:#ff4030}
.ub-net.warn .ic,.ub-net.warn .wt{animation:ub-hintp .8s ease-in-out infinite}
.ub-net .wt{display:none;font-family:var(--f-stencil);font-weight:700;letter-spacing:.2em}
.ub-net.warn .wt{display:inline}

/* ---------- spectating ---------- */
.ub-spec{position:absolute;inset:0;opacity:0;transition:opacity .5s}
.ub-spec.on{opacity:1}
.ub-spec::before,.ub-spec::after{content:"";position:absolute;left:0;right:0;height:7vh;background:#000}
.ub-spec::before{top:0}.ub-spec::after{bottom:0}
.ub-spec .box{position:absolute;left:50%;top:calc(7vh + 1.2em);transform:translateX(-50%);text-align:center;white-space:nowrap}
.ub-spec .a{font-family:var(--f-stencil);font-weight:700;letter-spacing:.35em;font-size:1.45em;color:var(--bone);text-shadow:0 0 .4em #000}
.ub-spec .a b{color:var(--c);font-weight:700}
.ub-spec .b{font-family:var(--f-type);font-size:.95em;color:#bcae95;margin-top:.35em;text-shadow:0 1px 2px #000}
.ub-spec .rec{display:inline-block;width:.55em;height:.55em;border-radius:50%;background:#d8261a;margin-right:.7em;vertical-align:.15em;animation:ub-blink 1.2s steps(1) infinite}

/* ---------- scoreboard (field report) ---------- */
.ub-sb{position:absolute;left:50%;top:45%;width:min(52em,94vw);transform:translate(-50%,-50%) rotate(-.4deg);padding:1.7em 2.2em 1.5em;
  background:var(--tx-paper) center/420px,#cdbf9f;color:#1c1712;font-family:var(--f-type);box-shadow:0 1em 3em rgba(0,0,0,.75);opacity:0;visibility:hidden;transition:opacity .12s,visibility 0s linear .12s}
.ub-sb.on{opacity:.97;visibility:visible;transition:opacity .12s,visibility 0s}
.ub-sb::before{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 4em rgba(90,60,20,.45)}
.ub-sb .hd{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #2a221a;padding-bottom:.5em;margin-bottom:.3em}
.ub-sb h3{margin:0;font-family:var(--f-stencil);font-weight:700;font-size:2.2em;letter-spacing:.1em;line-height:1}
.ub-sb .meta{font-size:.8em;letter-spacing:.18em;color:#5b4c3a;text-align:right;line-height:1.5}
.ub-sb .r{display:grid;grid-template-columns:.55em minmax(7em,1fr) 5.4em 3.6em 4.2em 4.4em 3.6em 5em;align-items:center;gap:0 .8em;padding:.5em .5em;margin:0 -.5em;border-bottom:1px dashed rgba(60,45,30,.4)}
.ub-sb .r.h{color:#5b4c3a;border-bottom:1px solid rgba(40,30,20,.6);padding:.35em .5em}
.ub-sb .r.h>span{font-size:.7em;letter-spacing:.14em;white-space:nowrap}
.ub-sb .r.me{background:rgba(140,20,10,.09)}
.ub-sb .tab{height:1.6em;background:var(--c);border:1px solid rgba(0,0,0,.65);box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}
.ub-sb .nm{text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ub-sb .nm small{display:block;font-size:.66em;letter-spacing:.14em;color:#6a5a45;margin-top:.1em}
.ub-sb .nm .dn{color:#a3120e;font-size:.7em;letter-spacing:.15em;margin-left:.6em}
.ub-sb .n{text-align:right;font-variant-numeric:tabular-nums}
.ub-sb .pts{font-weight:bold;color:#6a160f;font-size:1.08em}
.ub-sb .ping{text-align:right;white-space:nowrap;font-size:.9em}
.ub-sb .ping .ub-bars i{background:rgba(40,30,20,.2)}.ub-sb .ping .ub-bars i.on{background:#2a221a}
.ub-sb .ub-stamp{top:1.1em;right:13em}
.ub-sb .foot{margin-top:.8em;font-size:.75em;letter-spacing:.2em;color:#6a5a45;display:flex;justify-content:space-between}

/* ---------- co-op sheet (join/host) ---------- */
.ub-coop .paper{width:min(38em,92vw)}
.ub-fld{display:block;padding:.7em .6em;margin:0 -.6em;position:relative}
.ub-fld.is-sel{background:rgba(140,20,10,.08)}
.ub-fld.is-sel::before{content:"";position:absolute;left:-.9em;top:50%;border:.38em solid transparent;border-left:.5em solid #8b150f;transform:translateY(-50%)}
.ub-fld .lb{display:block;font-size:.78em;letter-spacing:.24em;color:#5b4c3a;margin-bottom:.4em}
.ub-name{width:100%;font-family:var(--f-type);font-size:1.35em;color:#1c1712;background:transparent;border:0;border-bottom:2px solid #2a221a;outline:0;padding:.15em .1em;
  text-transform:uppercase;letter-spacing:.08em;pointer-events:auto;caret-color:#8b150f}
.ub-name::placeholder{color:rgba(40,30,20,.35)}
.ub-fld .cnt{position:absolute;right:.6em;bottom:.95em;font-size:.72em;color:#7a6a55}
.ub-root .ub-big{display:flex;align-items:center;justify-content:space-between;width:100%;padding:.75em .9em;margin:.2em 0;border:2px solid #2a221a;background:rgba(42,34,26,.04);position:relative}
.ub-big .l{font-family:var(--f-stencil);font-weight:700;font-size:1.55em;letter-spacing:.16em;color:#1c1712}
.ub-big .d{font-size:.8em;color:#5b4c3a;text-align:right;max-width:14em}
.ub-root .ub-big.is-sel{background:#2a221a}
.ub-big.is-sel .l{color:#efe4c8}.ub-big.is-sel .d{color:#b9ab8f}
.ub-or{display:flex;align-items:center;gap:1em;margin:.9em 0 .3em;font-size:.78em;letter-spacing:.3em;color:#6a5a45}
.ub-or::before,.ub-or::after{content:"";flex:1;border-top:1px dashed rgba(60,45,30,.5)}
.ub-joinrow{display:flex;align-items:center;gap:1em;flex-wrap:wrap}
.ub-cells{position:relative;display:flex;gap:.35em}
.ub-cells span{width:1.55em;height:1.9em;display:grid;place-items:center;font-family:var(--f-type);font-size:1.7em;color:#1c1712;border:2px solid #2a221a;background:rgba(255,250,235,.25)}
.ub-cells span.cur{box-shadow:inset 0 -.18em 0 #8b150f;animation:ub-caretb 1s steps(1) infinite}
@keyframes ub-caretb{50%{box-shadow:none}}
.ub-cells input{position:absolute;inset:0;opacity:0;width:100%;font-size:16px;pointer-events:auto;cursor:text;text-transform:uppercase}
.ub-cells.bad{animation:ub-shake .4s}
@keyframes ub-shake{20%,60%{transform:translateX(-.35em)}40%,80%{transform:translateX(.35em)}}
.ub-root .ub-jbtn{font-family:var(--f-stencil);font-weight:700;font-size:1.35em;letter-spacing:.16em;padding:.35em .9em .3em;border:2px solid #2a221a;color:#1c1712}
.ub-root .ub-jbtn.ready{background:#8b150f;border-color:#5d0d09;color:#f3e6cc}
.ub-coop .note{margin-top:.5em;font-size:.82em;color:#8b150f;min-height:1.2em}
.ub-coop .hint{margin-top:1em;padding:.7em .9em;border-left:3px solid #8b150f;background:rgba(140,20,10,.07);font-size:.85em;line-height:1.45;color:#3b3024}

/* ---------- lobby ---------- */
.ub-lobby{z-index:11}
.ub-lobby .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(6,5,4,.95) 0%,rgba(6,5,4,.86) 45%,rgba(6,5,4,.6) 75%,rgba(6,5,4,.45) 100%)}
.ub-lobby .wrap{position:absolute;left:clamp(20px,7vw,160px);right:clamp(20px,6vw,140px);top:0;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:clamp(2em,5vw,7em)}
.ub-lobby .colL{flex:0 1 30em;min-width:0}
.ub-lobby .colR{flex:0 1 32em;min-width:0}
.ub-lobby h2{margin:0;font-family:var(--f-stencil);font-weight:700;font-size:clamp(3rem,6vw,7.5rem);line-height:.95;letter-spacing:.06em;color:#e3d7bd;
  text-shadow:0 0 .22em rgba(150,8,4,.5),.03em .05em 0 #3b0402;filter:url(#ub-distress)}
.ub-lobby .lbl2{font-family:var(--f-stencil);font-weight:700;letter-spacing:.35em;font-size:.9em;color:#b3392b;margin:1.8em 0 .6em}
.ub-code{display:flex;gap:.3em;position:relative;width:max-content}
.ub-code span{width:1.2em;height:1.45em;display:grid;place-items:center;font-family:var(--f-type);font-size:clamp(2.2rem,3.6vw,4.2rem);color:#17130f;line-height:1;
  background:var(--tx-paper) center/220px,#cdbf9f;box-shadow:0 .08em .25em rgba(0,0,0,.7),inset 0 0 .35em rgba(90,60,20,.55);transform:rotate(var(--r));animation:ub-stamp-in .45s cubic-bezier(.2,1.4,.4,1) both}
@keyframes ub-stamp-in{0%{opacity:0;transform:scale(1.8) rotate(var(--r))}100%{opacity:1;transform:rotate(var(--r))}}
.ub-code .ub-stamp{position:absolute;top:-1.5em;right:-4.4em;font-size:.85em;color:rgba(200,40,28,.9);border-color:rgba(200,40,28,.85);mix-blend-mode:normal;background:rgba(0,0,0,.001)}
.ub-root .ub-copy{display:inline-flex;align-items:center;gap:.6em;margin-top:1.1em;padding:.5em 1em .45em;border:2px solid rgba(232,223,202,.55);font-family:var(--f-stencil);font-weight:700;
  letter-spacing:.2em;font-size:.95em;color:var(--bone);transition:background .2s,color .2s,border-color .2s}
.ub-copy svg{width:1.1em;height:1.1em;fill:none;stroke:currentColor;stroke-width:2}
.ub-copy.is-sel{background:var(--bone);color:#16120e;border-color:var(--bone)}
.ub-copy.done{border-color:#9fd46a;color:#b7f26a;background:rgba(120,190,60,.12)}
.ub-copy.fail{border-color:#e04a30;color:#ff8a70}
.ub-url{margin-top:.6em;font-family:var(--f-type);font-size:.8em;color:#7d7362;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.ub-lobby .ub-items{margin-top:1.8em;padding-left:.9em}
.ub-lobby .ub-items .ub-item{font-size:clamp(1.7rem,2.5vw,3.2rem)}
.ub-wait{margin:1.6em 0 .2em .1em;font-family:var(--f-type);font-size:1.15em;color:#c9bca2}
.ub-wait::after{content:"";display:inline-block;width:1.2em;text-align:left;animation:ub-ell 1.6s steps(4) infinite}
@keyframes ub-ell{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
.ub-lstatus{display:flex;align-items:center;gap:.7em;margin-top:1.4em;font-family:var(--f-type);font-size:.9em;color:#8f846f;letter-spacing:.04em}
.ub-lstatus i{width:.5em;height:.5em;border-radius:50%;background:#9fd46a;box-shadow:0 0 .5em #9fd46a;animation:ub-hintp 1.6s ease-in-out infinite;flex:0 0 auto}
.ub-roster-h{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--f-stencil);font-weight:700;letter-spacing:.3em;font-size:.9em;color:#b3a68d;
  border-bottom:1px solid rgba(232,223,202,.2);padding-bottom:.5em;margin-bottom:1.1em}
.ub-roster-h span:last-child{font-family:var(--f-type);font-weight:normal;letter-spacing:.1em;color:#7d7362}
.ub-tags{display:flex;flex-direction:column;gap:.85em}
.ub-tag{position:relative;height:4.7em;display:flex;align-items:center;gap:1em;padding:0 1.4em 0 3.3em;border:.26em solid var(--c);
  border-radius:1.1em 2.35em 2.35em 1.1em;color:#211d18;
  background:var(--tx-noise),linear-gradient(165deg,#e3dfd6 0%,#a6a298 38%,#cfcbc1 58%,#7d796f 100%);background-size:160px,100% 100%;background-blend-mode:overlay,normal;
  box-shadow:0 .3em .7em rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.65),inset 0 -2px 4px rgba(0,0,0,.35);animation:ub-tag-in .5s cubic-bezier(.2,1.2,.4,1) both}
.ub-tag::before{content:"";position:absolute;left:1em;top:50%;width:1em;height:1em;margin-top:-.5em;border-radius:50%;background:#15120e;box-shadow:inset 0 .12em .2em rgba(0,0,0,.9),0 1px 0 rgba(255,255,255,.55)}
.ub-tag::after{content:"";position:absolute;left:-.26em;top:50%;width:.55em;height:1.3em;margin-top:-.65em;background:var(--c);clip-path:polygon(0 0,100% 18%,100% 82%,0 100%)}
@keyframes ub-tag-in{0%{opacity:0;transform:translateX(2em) rotate(2deg)}100%{opacity:1;transform:none}}
.ub-tag .who{flex:1;min-width:0}
.ub-tag .nm{font-family:var(--f-cond);font-weight:700;font-size:1.45em;letter-spacing:.1em;text-transform:uppercase;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  color:#2b2620;text-shadow:0 1px 0 rgba(255,255,255,.55),0 -1px 0 rgba(0,0,0,.3)}
.ub-tag .sub{font-family:var(--f-type);font-size:.78em;letter-spacing:.1em;color:#4a443a;margin-top:.15em;white-space:nowrap}
.ub-tag .you{font-family:var(--f-stencil);font-weight:700;font-size:.7em;letter-spacing:.2em;color:#fff;background:#2a251e;padding:.12em .45em .05em;margin-left:.6em;vertical-align:.25em}
.ub-tag .host{font-family:var(--f-stencil);font-weight:700;font-size:1em;letter-spacing:.2em;color:#a3160f;border:.15em solid #a3160f;padding:.14em .5em .04em;transform:rotate(-7deg);
  mix-blend-mode:multiply;opacity:.92}
.ub-tag .pg{display:flex;flex-direction:column;align-items:flex-end;gap:.2em;font-family:var(--f-type);font-size:.78em;color:#3b352c;min-width:3.6em}
.ub-tag .pg .ub-bars i{background:rgba(30,25,20,.2)}.ub-tag .pg .ub-bars i.on{background:#2a251e}
.ub-tag .pg .ub-bars.q1 i.on{background:#a3120e}
.ub-tag.empty{background:rgba(232,223,202,.035);border:2px dashed rgba(232,223,202,.22);box-shadow:none;color:#8a8070;animation:none}
.ub-tag.empty::before{background:transparent;border:2px dashed rgba(232,223,202,.2);box-shadow:none}
.ub-tag.empty::after{display:none}
.ub-tag.empty .nm{font-family:var(--f-type);font-weight:normal;font-size:1.05em;letter-spacing:.06em;text-transform:none;color:#8a8070;text-shadow:none;animation:ub-hintp 2.4s ease-in-out infinite}
.ub-tag.empty .sub{color:#5d564b}

/* ---------- connecting ---------- */
.ub-conn{z-index:24;background:rgba(3,3,2,.84);display:grid;place-items:center}
.ub-conn .box{display:flex;flex-direction:column;align-items:center;text-align:center;max-width:90vw}
.ub-conn .radio{width:7em;height:7em;overflow:visible}
.ub-conn .radio .w{fill:none;stroke:#c9bca2;stroke-width:2.2;stroke-linecap:round;opacity:.15;animation:ub-wave 1.6s ease-out infinite}
.ub-conn .radio .w:nth-of-type(2){animation-delay:.2s}.ub-conn .radio .w:nth-of-type(3){animation-delay:.4s}
@keyframes ub-wave{0%{opacity:.1}25%{opacity:1;stroke:#e04a30}60%,100%{opacity:.12}}
.ub-conn .radio .m{fill:#c9bca2}
.ub-conn .t{margin-top:1.3em;font-family:var(--f-type);font-size:1.3em;color:var(--bone);letter-spacing:.04em}
.ub-conn .t::after{content:"";display:inline-block;width:1.3em;text-align:left;animation:ub-ell 1.6s steps(4) infinite}
.ub-conn .morse{margin-top:.8em;display:flex;gap:.35em;height:.4em;align-items:center}
.ub-conn .morse i{height:.32em;background:#a3120e;border-radius:.16em;opacity:.2;animation:ub-morse 2.4s steps(1) infinite}
@keyframes ub-morse{0%,8%{opacity:1}9%,100%{opacity:.18}}
.ub-conn .ub-items{margin-top:2.4em;padding-left:0;align-items:center}
.ub-conn .ub-items .ub-item{font-size:1.9em}

/* ---------- error telegram ---------- */
.ub-err{z-index:26;background:rgba(0,0,0,.72);display:grid;place-items:center}
.ub-err .tg{position:relative;width:min(36em,92vw);padding:1.5em 2.1em 1.4em;background:var(--tx-paper) center/420px,#d6c7a4;color:#1c1712;font-family:var(--f-type);
  box-shadow:0 1.2em 3em rgba(0,0,0,.8);transform:rotate(-1deg)}
.ub-err.on .tg{animation:ub-tg-in .5s cubic-bezier(.2,1.2,.3,1) both}
@keyframes ub-tg-in{0%{opacity:0;transform:translateY(2em) rotate(-4deg)}100%{opacity:1;transform:rotate(-1deg)}}
.ub-err .tg::before{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 4em rgba(90,60,20,.45)}
.ub-err .hd{display:flex;justify-content:space-between;font-size:.75em;letter-spacing:.22em;color:#5b4c3a;border-bottom:2px solid #2a221a;padding-bottom:.5em}
.ub-err .ttl{display:inline-block;margin:.9em 0 .7em;font-family:var(--f-stencil);font-weight:700;font-size:2.3em;letter-spacing:.1em;line-height:1.05;color:#a3160f;
  border:.12em solid #a3160f;padding:.12em .4em .04em;transform:rotate(-2.5deg);filter:url(#ub-distress)}
.ub-err .tx{font-size:1.08em;line-height:1.6;text-transform:uppercase;letter-spacing:.04em;min-height:3.2em}
.ub-err .tx .stop{color:#6a5a45}
.ub-err .ft{display:flex;justify-content:space-between;align-items:center;margin-top:1.1em;border-top:1px dashed rgba(60,45,30,.5);padding-top:.7em;font-size:.72em;letter-spacing:.2em;color:#6a5a45}
.ub-err .ok{font-family:var(--f-stencil);font-weight:700;font-size:1.9em;letter-spacing:.2em;color:#1c1712;padding:.1em .7em 0;border:2px solid #2a221a}
.ub-err .ok.is-sel{background:#2a221a;color:#efe4c8}

@media (max-width:900px){
  .ub-lobby .wrap{flex-direction:column;justify-content:center;align-items:stretch;gap:1.4em;overflow:auto;padding:4vh 0}
  .ub-lobby .colL,.ub-lobby .colR{flex:none;width:100%}
  .ub-lobby h2{font-size:2.8rem}
  .ub-lobby .lbl2{margin-top:.8em}
  .ub-tag{height:3.8em}
  .ub-sb .r{grid-template-columns:.5em minmax(5em,1fr) 4.5em 3em 3.8em;font-size:.9em}
  .ub-sb .r>:nth-child(6),.ub-sb .r>:nth-child(7),.ub-sb .r>:nth-child(8){display:none}
  .ub-sb .ub-stamp{display:none}
  .ub-feed{top:22%}
}
`;

const SLOT_COLORS = ["#e9e4d8", "#4f8fe6", "#e6c14f", "#5cc26b"];
const SLOT_CHAR = [
  "Pvt. Cole Harlan",
  "Sgt. Alfie Marsh",
  "Cpl. Yuri Volkov",
  "Élodie Fournier",
];
const slotColor = (s) => SLOT_COLORS[s] || SLOT_COLORS[0];
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{5}$`);
const MEDIC_SVG =
  '<svg class="ub-medic" viewBox="-10 -10 20 20"><path d="M-3-9h6v6h6v6h-6v6h-6v-6h-6v-6h6z" rx="1" fill="#e32a1c" stroke="#2a0000" stroke-width="1.2" stroke-linejoin="round"/></svg>';
function sanitizeName(s, trim = false) {
  let v = String(s || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} _.'\-]/gu, "")
    .replace(/\s+/g, " ");
  if (trim) v = v.trim();
  return v.slice(0, 16);
}
function cleanCode(s) {
  const str = String(s || "");
  const m = /[?&#]join=([A-Za-z0-9]{5})/i.exec(str);
  const src = m ? m[1] : str;
  return src
    .toUpperCase()
    .split("")
    .filter((c) => CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, 5);
}
function pingQ(ms) {
  if (ms == null || !isFinite(ms)) return 0;
  return ms < 70 ? 4 : ms < 130 ? 3 : ms < 220 ? 2 : 1;
}
function barsHTML(ms) {
  const q = pingQ(ms);
  return `<span class="ub-bars q${q}">${[1, 2, 3, 4].map((k) => `<i class="${k <= q ? "on" : ""}"></i>`).join("")}</span>`;
}
function reEsc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DEFS = `
<svg class="ub-defs" aria-hidden="true" focusable="false"><defs>
  <filter id="ub-brush" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="3" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="6.5" xChannelSelector="R" yChannelSelector="G" result="disp"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55 0.045" numOctaves="2" seed="8" result="streak"/>
    <feColorMatrix in="streak" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.4 2.55" result="streakA"/>
    <feComposite in="disp" in2="streakA" operator="in" result="dry"/>
    <feColorMatrix in="streak" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.2 -1.2" result="darkA"/>
    <feFlood flood-color="#2a0000" flood-opacity=".55"/>
    <feComposite in2="darkA" operator="in" result="darkS"/>
    <feComposite in="darkS" in2="dry" operator="in" result="darkIn"/>
    <feMerge><feMergeNode in="dry"/><feMergeNode in="darkIn"/></feMerge>
  </filter>
  <filter id="ub-distress" x="-5%" y="-10%" width="110%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="11" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -4 2.95" result="holes"/>
    <feComposite in="SourceGraphic" in2="holes" operator="in" result="pitted"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="w"/>
    <feDisplacementMap in="pitted" in2="w" scale="3.5" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</defs></svg>`;

const FLAVOUR = [
  "Field log, Nov. 1944 — the dead at Blackwald do not stay buried.",
  "Board the windows. Every plank buys you a breath.",
  "Power to the generator vault was cut three weeks ago. Someone should fix that.",
  "The box in the command post hums at night. Nobody remembers who left it there.",
  "Aim for the head. Everything else just makes them angry.",
  "Radio operator’s last entry: “They are coming up through the clearing again.”",
  "Grenades are resupplied at the start of every round.",
  "The anvil in the vault takes steel and gives back something worse.",
];

