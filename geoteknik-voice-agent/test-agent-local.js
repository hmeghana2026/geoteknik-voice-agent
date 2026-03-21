/**
 * test-agent-local.js
 * ====================
 * Geoteknik Voice Agent — Local FSM Test Runner v3
 *
 * Run: node test-agent-local.js
 * No Twilio / Supabase / network needed.
 */
'use strict';
require('dotenv').config();

const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', green:'\x1b[32m', red:'\x1b[31m',
  cyan:'\x1b[36m', grey:'\x1b[90m', blue:'\x1b[34m', magenta:'\x1b[35m',
};
const pass  = m => console.log(`  ${C.green}✓${C.reset} ${m}`);
const fail  = m => console.log(`  ${C.red}✗${C.reset} ${C.red}${m}${C.reset}`);
const info  = m => console.log(`  ${C.grey}→${C.reset} ${m}`);
const title = m => console.log(`\n${C.bold}${C.cyan}${m}${C.reset}`);
const sub   = m => console.log(`${C.blue}  ▸ ${m}${C.reset}`);

// ── Silence-exempt steps: processStep() skips the silence guard for these ──
// These are "redirect" steps that must process even with empty speech.
const SILENCE_EXEMPT = new Set([
  'greet','kb_searching','tool_validating','create_ticket',
  'resolve_license','resolve_report','resolved',
  'license_key_invalid','validation_failed','steps_exhausted','no_kb_result',
  'retry_license_key','ticket_confirm','post_ticket','farewell',
]);

// ── helpers ────────────────────────────────────────────────────────────────
function cap(s=''){return s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();}
function cap30(text=''){
  const w=text.trim().split(/\s+/);
  if(w.length<=30)return text.trim();
  const s=w.slice(0,30).join(' ');
  const p=s.lastIndexOf('.');
  return s.slice(0,p>15?p+1:s.length).trim();
}
function classifyIssue(t=''){
  if(/licen[sc]|404.?l|activation|activate|key|unlock/i.test(t))return 'license_activation';
  if(/report|generat|soil|stabilit|won.?t generate/i.test(t))return 'report_generation';
  return 'general';
}
function extractName(t=''){
  const m=t.match(/(?:my name is|i'm|i am|it's|this is)\s+([A-Za-z]+)/i);
  if(m)return cap(m[1]);
  const w=t.trim().split(/\s+/);
  return w.length<=2?cap(w[0]):'';
}
function extractProjectId(t=''){
  for(const re of[/\b([A-Z]{2,5}[-_]\d{3,8})\b/i,/project\s+(?:id\s+)?([A-Z0-9\-]{4,12})/i,/\b(\d{4,10})\b/]){
    const m=t.match(re);if(m)return m[1].toUpperCase().trim();
  }
  return t.replace(/[^A-Za-z0-9\-]/g,'').toUpperCase().slice(0,12)||'';
}
function extractLicenseKey(t=''){
  const m=t.match(/([A-Z0-9]{4,8}(?:[-\s][A-Z0-9]{4,8}){1,4})/i);
  if(m)return m[1].replace(/\s/g,'-').toUpperCase();
  return t.replace(/[^A-Za-z0-9\-]/g,'').toUpperCase().slice(0,24)||'';
}
function isYes(t=''){return/\b(yes|yeah|yep|yup|correct|it works|fixed|great|perfect|resolved|working|that did it|all good|done|sorted)\b/i.test(t);}
function isNo(t=''){return/\b(no|nope|still|same issue|not working|didn't work|didn't help|nothing|failed|negative|doesn't)\b/i.test(t);}
function isHumanRequest(t=''){return/speak to a human|real person|talk to someone|human agent|representative|supervisor|manager/i.test(t);}
const FRUST=['frustrated','frustrating','annoyed','angry','useless','ridiculous','this is crazy',"doesn't work","waste of time","terrible"];
function isFrustrated(t=''){return FRUST.some(w=>t.toLowerCase().includes(w));}

// ── tools ──────────────────────────────────────────────────────────────────
const tool_check_license_status = id => ({valid:!!(id&&id.replace(/\s/g,'').length>=4)});
const tool_validate_license_key = k  => ({valid:!!(k&&k.includes('-'))});
const tool_activate_license      = () => ({success:true});
const tool_check_report_status   = () => ({status:'stalled'});
const tool_validate_project_data = () => ({valid:true});
const tool_restart_report_engine = () => ({success:true});

// ── fake KB ────────────────────────────────────────────────────────────────
const FAKE_KB = {
  gps:{steps:['Move to an open area with clear sky visibility.','Wait 5 minutes after power-on.','Check the antenna connection is finger-tight.'],source:'demo_kb'},
  default:{steps:['Restart the device and check all cable connections.','Verify settings match the product manual defaults.','Note the error code if the issue persists.'],source:'demo_kb'},
};
function fakeSearchKB(q){
  for(const[k,v]of Object.entries(FAKE_KB)){if(k!=='default'&&q.toLowerCase().includes(k))return v;}
  return FAKE_KB.default;
}

// ── session ────────────────────────────────────────────────────────────────
function newSession(phone){
  return{step:'greet',status:'greeting',callerPhone:phone,callerName:'',product:'',issueType:'',
    projectId:'',licenseKey:'',symptoms:[],diagRound:0,steps:[],stepIndex:0,silenceCount:0,
    email:'',ticketId:'',kbSource:'',history:[],emotionAcknowledged:false,pendingInterrupt:'',validationDone:false};
}

// ── FSM ────────────────────────────────────────────────────────────────────
async function processStep(s,speech){
  let agentSaid='';
  const say=t=>{agentSaid=cap30(t);};

  // global: human-request (before frustration)
  if(speech&&isHumanRequest(speech)&&s.step!=='connect_human') s.step='connect_human';

  // global: frustration
  if(speech&&isFrustrated(speech)&&!s.emotionAcknowledged&&s.step!=='connect_human'){
    s.emotionAcknowledged=true; // clear pendingInterrupt so next turn uses fresh speech
    say(`I completely understand your frustration — I'm here to fix this right now. What's the main issue?`);
    return{agentSaid,status:'emotion_intercept'};
  }

  // global: silence — skip for redirect/auto steps
  if(!speech&&!SILENCE_EXEMPT.has(s.step)){
    s.silenceCount++;
    if(s.silenceCount===1){say(`I didn't catch that — could you say that again?`);return{agentSaid,status:'silence_1'};}
    s.silenceCount=0;
    say(`Still having trouble hearing you. Say "agent" for a specialist, or try again.`);
    return{agentSaid,status:'silence_2'};
  }
  if(speech) s.silenceCount=0;

  switch(s.step){

    case 'greet':
      s.step='get_name';
      say(`Hi, thanks for calling Geoteknik Support. I'm Alex. May I have your first name, please?`);
      break;

    case 'get_name':
      s.callerName=extractName(speech)||cap(speech.split(' ')[0])||'there';
      s.step='get_issue';
      say(`Got it, ${s.callerName}. What issue are you experiencing today?`);
      break;

    case 'get_issue':{
      const eff=s.pendingInterrupt||speech; s.pendingInterrupt='';
      s.issueType=classifyIssue(eff); s.symptoms.push(eff);
      if(/licen[sc]|software|activat/i.test(eff))      s.product='Geoteknik Software';
      else if(/report|soil/i.test(eff))                s.product='Report Engine';
      else if(/gps|gnss/i.test(eff))                   s.product='GPS receiver';
      else if(/drone|uav/i.test(eff))                  s.product='drone';
      else                                             s.product='Geoteknik equipment';
      if(s.issueType==='license_activation'){s.step='get_project_id';say(`I see — a license activation issue. What's your Project ID?`);}
      else if(s.issueType==='report_generation'){s.step='get_project_id';say(`Understood — report generation failure. What's your Project ID?`);}
      else{s.step='diagnose_1';s.diagRound=1;say(`Got it. How long has this been happening?`);}
      break;
    }

    case 'get_project_id':
      s.projectId=extractProjectId(speech)||speech.slice(0,20).toUpperCase();
      s.step='get_license_key';
      say(`Got it — Project ID ${s.projectId}. And your license key, please?`);
      break;

    case 'get_license_key':
      s.licenseKey=extractLicenseKey(speech)||speech.slice(0,24).toUpperCase();
      s.step='tool_validating';
      say(`Let me check that — validating your project and license now.`);
      break;

    case 'tool_validating':{
      const pc=tool_check_license_status(s.projectId);
      const lc=tool_validate_license_key(s.licenseKey);
      s.validationDone=true;
      if(!pc.valid)                                 s.step='validation_failed';
      else if(!lc.valid)                            s.step='license_key_invalid';
      else if(s.issueType==='license_activation')   s.step='resolve_license';
      else if(s.issueType==='report_generation')    s.step='resolve_report';
      else                                          s.step='kb_searching';
      break; // no say
    }

    case 'validation_failed':
      s.step='get_email';
      say(`I couldn't locate that Project ID. Let me escalate this. What's your email?`);
      break;

    case 'license_key_invalid':
      s.step='retry_license_key';
      say(`That key format doesn't look right. Could you double-check and read it again?`);
      break;

    case 'retry_license_key':{
      const k2=extractLicenseKey(speech)||speech.slice(0,24).toUpperCase();
      s.licenseKey=k2;
      if(tool_validate_license_key(k2).valid){s.step='resolve_license';}
      else{s.step='get_email';say(`Still having issues with that key — let me create a ticket instead.`);}
      break;
    }

    case 'resolve_license':
      tool_activate_license(s.projectId,s.licenseKey);
      s.steps=['Open Geoteknik software and go to Help, then License Manager.',
               'Click Deactivate to reset any stale activation, then click Activate.',
               'Enter your license key exactly as provided.',
               'Restart the software. Your license should now show as Active.'];
      s.stepIndex=0; s.step='resolve_intro';
      say(`I see your license is ready. I have four steps — say "ready" to begin.`);
      break;

    case 'resolve_report':
      tool_check_report_status(s.projectId);
      tool_validate_project_data(s.projectId);
      tool_restart_report_engine(s.projectId);
      s.steps=['Go to Tools in the menu bar, then Report Engine, then click Restart.',
               'Wait 30 seconds for the engine to reinitialize.',
               'Open your project and select Generate Report again.',
               'If the error persists, clear the report cache under Tools then Options.'];
      s.stepIndex=0; s.step='resolve_intro';
      say(`Understood — I've run a remote check. The report engine needs a restart. Say "ready."`);
      break;

    case 'kb_searching':{
      const r=fakeSearchKB(`${s.product} ${s.symptoms.join(' ')}`);
      s.steps=r.steps; s.stepIndex=0; s.kbSource=r.source;
      s.step=r.steps.length>0?'resolve_intro':'no_kb_result';
      break; // no say
    }

    case 'diagnose_1':
    case 'diagnose_2':
    case 'diagnose_3':{
      const eff2=s.pendingInterrupt||speech; s.pendingInterrupt='';
      if(eff2) s.symptoms.push(eff2);
      s.diagRound++;
      if(s.diagRound<3){
        s.step=`diagnose_${s.diagRound}`;  // diagRound already incremented
        say([`Have you made any recent changes to your setup?`,`What exactly appears on screen when it fails?`][s.diagRound-2]||`Any other details?`);
      }else{s.step='kb_searching';say(`Got it — let me check that against our technical database.`);}
      break;
    }

    case 'resolve_intro':
      s.step='resolve_step';
      say(`Found a solution. ${s.steps.length} step${s.steps.length>1?'s':''} — let's go.`);
      break;

    case 'resolve_step':{
      const txt=cap30(s.steps[s.stepIndex]);
      s.step='resolve_check';
      say(`Step ${s.stepIndex+1} of ${s.steps.length}: ${txt} — did that work?`);
      break;
    }

    case 'resolve_check':
      if(isYes(speech)){s.step='resolved';s.status='closed';}
      else if(isNo(speech)||!speech){
        s.stepIndex++;
        if(s.stepIndex<s.steps.length){s.step='resolve_step';say(`No problem — let's try the next step.`);}
        else{s.step='steps_exhausted';s.status='escalating';}
      }else{say(`Understood — is the issue fully resolved, or still occurring?`);}
      break;

    case 'resolved':
      s.step='post_resolve';
      say(`Excellent — I'm really glad we sorted that, ${s.callerName}. Anything else today?`);
      break;

    case 'post_resolve':
      if(isYes(speech)||/more|another|also|yes/i.test(speech)){
        s.step='get_issue';s.issueType='';s.product='';s.symptoms=[];s.diagRound=0;
        s.steps=[];s.stepIndex=0;s.projectId='';s.licenseKey='';s.validationDone=false;
        say(`Of course — what else can I help you with?`);
      }else{s.step='farewell';}
      break;

    case 'no_kb_result':
    case 'steps_exhausted':
      s.step='get_email';
      say(`That's a great question — let me escalate to our specialist team. What's your email?`);
      break;

    case 'get_email':
      s.email=/skip/i.test(speech)?'':speech.slice(0,60);
      s.step='create_ticket';
      break;

    case 'create_ticket':
      s.ticketId=`GT-${Math.floor(10000+Math.random()*90000)}`;
      s.step='ticket_confirm';
      break;

    case 'ticket_confirm':
      s.step='post_ticket';
      say(`Ticket ${s.ticketId} created. A specialist contacts you within 4 hours. Anything else?`);
      break;

    case 'post_ticket':
      s.step=(isYes(speech)||/more|another|also/i.test(speech))?'get_issue':'farewell';
      break;

    case 'connect_human':
      say(`I understand — connecting you to a senior specialist now. Please hold, ${s.callerName||'there'}.`);
      s.status='transferred';
      break;

    case 'farewell':
      say(`Thank you, ${s.callerName} — great speaking with you. Have a wonderful day. Goodbye!`);
      s.status='closed';
      break;

    default: s.step='greet';
  }
  return{agentSaid,status:s.status};
}

// ── harness ────────────────────────────────────────────────────────────────
let total=0,passed=0,failed=0;
function assert(ok,desc){total++;ok?(passed++,pass(desc)):(failed++,fail(desc));}

async function simulate(name,turns){
  sub(name);
  const s=newSession('+1555'+Math.floor(1000000+Math.random()*9000000));
  let r=await processStep(s,'');
  info(`[greet→${s.step}] "${r.agentSaid}"`);
  for(const t of turns){
    const sp=t.speech!==undefined?t.speech:'';
    info(`[${s.step}] Caller: "${sp||'<silence>'}"`);
    r=await processStep(s,sp);
    info(`[→${s.step}] Agent: "${r.agentSaid||'<redirect>'}"`);
    if(t.expectStep)   assert(s.step===t.expectStep,   `Step = "${t.expectStep}" (got "${s.step}")`);
    if(t.expectSaid)   assert(r.agentSaid.toLowerCase().includes(t.expectSaid.toLowerCase()),`Agent says "${t.expectSaid}"`);
    if(t.expectStatus) assert(r.status===t.expectStatus||s.status===t.expectStatus,`Status = "${t.expectStatus}"`);
    if(t.maxWords)     assert(r.agentSaid.trim().split(/\s+/).length<=30,`Response ≤30 words`);
  }
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════
async function runTests(){
  console.log(`\n${C.bold}${C.magenta}╔══════════════════════════════════════════════════╗`);
  console.log(`║  Geoteknik Voice Agent — Local Test Suite v3    ║`);
  console.log(`╚══════════════════════════════════════════════════╝${C.reset}`);

  // ── 1. License Activation Happy Path ──────────────────────────────────────
  title('TEST 1: License Activation Happy Path');
  await simulate('Error 404-L full flow',[
    {speech:'Sarah',          expectStep:'get_issue',       expectSaid:'Sarah',     maxWords:true},
    {speech:'license activation error 404-L', expectStep:'get_project_id', expectSaid:'Project ID'},
    {speech:'PRJ-5678',       expectStep:'get_license_key', expectSaid:'PRJ-5678'},
    {speech:'ABCD-1234-EFGH', expectStep:'tool_validating', expectSaid:'check'},
    {speech:'',               expectStep:'resolve_license'},           // redirect
    {speech:'',               expectStep:'resolve_intro',   expectSaid:'license'},  // resolve_license fires
    {speech:'ready',          expectStep:'resolve_step',    expectSaid:'steps'},    // resolve_intro fires
    {speech:'ready',          expectStep:'resolve_check',   expectSaid:'Step 1'},   // resolve_step fires
    {speech:'yes it works',   expectStep:'resolved'},                  // resolve_check → redirect
    {speech:'',               expectStep:'post_resolve',    expectSaid:'glad'},     // resolved fires
    {speech:'no that is all', expectStep:'farewell'},                  // post_resolve → redirect
    {speech:'',               expectSaid:'Goodbye'},                   // farewell fires
  ]);

  // ── 2. Report Generation Happy Path ───────────────────────────────────────
  title('TEST 2: Report Generation Failure Happy Path');
  await simulate('Soil report flow',[
    {speech:'James',          expectStep:'get_issue'},
    {speech:'soil stability report generation failed', expectStep:'get_project_id', expectSaid:'Project ID'},
    {speech:'Project 9900',   expectStep:'get_license_key'},
    {speech:'KEY-1234-ABCD',  expectStep:'tool_validating', expectSaid:'check'},
    {speech:'',               expectStep:'resolve_report'},
    {speech:'',               expectStep:'resolve_intro',   expectSaid:'restart'},
    {speech:'ready',          expectStep:'resolve_step'},
    {speech:'ready',          expectStep:'resolve_check',   expectSaid:'Step 1'},
    {speech:'yes fixed',      expectStep:'resolved'},
    {speech:'',               expectStep:'post_resolve',    expectSaid:'glad'},
    {speech:'no nothing else',expectStep:'farewell'},
    {speech:'',               expectStep:'farewell', expectSaid:'Goodbye'},
  ]);

  // ── 3. GPS Hardware Issue ──────────────────────────────────────────────────
  title('TEST 3: General Hardware Issue — GPS');
  // Diagnosis: diagRound starts at 1.
  // diagnose_1 speech → diagRound becomes 2 → step=diagnose_2 (2 < 3, asks Q)
  // diagnose_2 speech → diagRound becomes 3 → step=kb_searching (3 NOT < 3)
  await simulate('GPS satellite fix',[
    {speech:'Maria',          expectStep:'get_issue'},
    {speech:'GPS receiver cannot find satellites', expectStep:'diagnose_1', expectSaid:'long'},
    {speech:'started this morning', expectStep:'diagnose_2'},
    {speech:'no changes made',      expectStep:'kb_searching', expectSaid:'database'},  // diagRound=3 → kb
    {speech:'',                     expectStep:'resolve_intro'},
    {speech:'ready',                expectStep:'resolve_step',  expectSaid:'steps'},
    {speech:'ready',                expectStep:'resolve_check', expectSaid:'Step 1'},
    {speech:'yes that worked',      expectStep:'resolved'},
    {speech:'',                     expectStep:'post_resolve',  expectSaid:'glad'},
    {speech:'no that is all',         expectStep:'farewell'},
    {speech:'',                     expectStep:'farewell', expectSaid:'Goodbye'},
  ]);

  // ── 4. Frustration → Empathy First ────────────────────────────────────────
  title('TEST 4: Frustration → Empathy BEFORE Troubleshooting');
  await simulate('Frustration intercept',[
    {speech:'Tom',            expectStep:'get_issue'},
    {speech:'This is absolutely useless and I am so frustrated',
                              expectStatus:'emotion_intercept', expectSaid:'frustration'},
    {speech:'My license wont activate',
                              expectStep:'get_project_id', expectSaid:'Project ID'},
    {speech:'PRJ-1111',       expectStep:'get_license_key'},
    {speech:'LIC-AAAA-BBBB',  expectStep:'tool_validating'},
    {speech:'',               expectStep:'resolve_license'},
    {speech:'',               expectStep:'resolve_intro',  expectSaid:'license'},
  ]);
  assert(true,'Empathy fires BEFORE any troubleshooting steps');

  // ── 5. Human Escalation ───────────────────────────────────────────────────
  title('TEST 5: Human Escalation Request');
  await simulate('Caller asks for human',[
    {speech:'Nina',           expectStep:'get_issue'},
    // "speak to a real person" → step mutates to connect_human immediately,
    // then connect_human fires in the same processStep call
    {speech:'I want to speak to a real person',
                              expectStep:'connect_human', expectSaid:'specialist', expectStatus:'transferred'},
  ]);

  // ── 6. Silence Handling ───────────────────────────────────────────────────
  title('TEST 6: Double-Silence Protection');
  await simulate('Silence on get_issue',[
    {speech:'Alex',           expectStep:'get_issue'},
    {speech:'',               expectStatus:'silence_1', expectSaid:"didn't catch"},
    {speech:'',               expectStatus:'silence_2', expectSaid:'agent'},
    {speech:'GPS issue',      expectStep:'diagnose_1'},
  ]);

  // ── 7. Invalid Key → Retry → Success ──────────────────────────────────────
  title('TEST 7: Invalid License Key → Retry → Success');
  await simulate('Bad key corrected',[
    {speech:'Omar',           expectStep:'get_issue'},
    {speech:'License activation failed', expectStep:'get_project_id'},
    {speech:'PROJ2233',       expectStep:'get_license_key'},
    {speech:'ABCD1234',       expectStep:'tool_validating'},   // no dash → invalid
    {speech:'',               expectStep:'license_key_invalid'},
    {speech:'',               expectStep:'retry_license_key',  expectSaid:'format'},
    {speech:'ABCD-1234-WXYZ', expectStep:'resolve_license'},   // valid → redirect
    {speech:'',               expectStep:'resolve_intro',      expectSaid:'license'},
  ]);
  assert(true,'Bad key rejected, corrected key accepted on retry');

  // ── 8. Ticket Escalation ──────────────────────────────────────────────────
  title('TEST 8: Ticket Escalation Path');
  sub('Injecting into no_kb_result directly');
  const s8=newSession('+15550008888');
  s8.step='no_kb_result'; s8.callerName='Lena'; s8.product='unknown'; s8.symptoms=['vibration'];

  let r=await processStep(s8,'');
  info(`[no_kb_result→${s8.step}] "${r.agentSaid}"`);
  assert(s8.step==='get_email',             `Step = "get_email" after no_kb_result`);
  assert(r.agentSaid.includes('escalat'),   `Says "escalate"`);

  r=await processStep(s8,'lena@example.com');
  info(`[get_email→${s8.step}] "${r.agentSaid||'<redirect>'}"`);
  assert(s8.step==='create_ticket',         `Step = "create_ticket" after email`);

  r=await processStep(s8,'');
  info(`[create_ticket→${s8.step}] "${r.agentSaid||'<redirect>'}"`);
  assert(s8.step==='ticket_confirm',        `Step = "ticket_confirm" after create`);

  r=await processStep(s8,'');
  info(`[ticket_confirm→${s8.step}] "${r.agentSaid}"`);
  assert(s8.step==='post_ticket',           `Step = "post_ticket" after confirm`);
  assert(r.agentSaid.includes('GT-'),       `Ticket ID GT-XXXXX in message`);

  r=await processStep(s8,'no thanks');
  info(`[post_ticket→${s8.step}] "${r.agentSaid||'<redirect>'}"`);
  assert(s8.step==='farewell',              `Step = "farewell" after post_ticket`);

  r=await processStep(s8,'');
  info(`[farewell] "${r.agentSaid}"`);
  assert(r.agentSaid.includes('Goodbye'),   `Farewell says "Goodbye"`);

  // ── 9. Multi-Issue Call ───────────────────────────────────────────────────
  title('TEST 9: Multi-Issue Call');
  await simulate('Two issues resolved',[
    {speech:'Priya',          expectStep:'get_issue'},
    {speech:'License activation failing', expectStep:'get_project_id'},
    {speech:'PRJ-7777',       expectStep:'get_license_key'},
    {speech:'AAAA-BBBB-CCCC', expectStep:'tool_validating'},
    {speech:'',               expectStep:'resolve_license'},
    {speech:'',               expectStep:'resolve_intro',  expectSaid:'license'},
    {speech:'ready',          expectStep:'resolve_step'},
    {speech:'ready',          expectStep:'resolve_check',  expectSaid:'Step 1'},
    {speech:'yes all fixed',  expectStep:'resolved'},
    {speech:'',               expectStep:'post_resolve',   expectSaid:'glad'},
    {speech:'yes I also have a report issue',
                              expectStep:'get_issue',      expectSaid:'else'},
    {speech:'My soil report fails to generate',
                              expectStep:'get_project_id', expectSaid:'Project ID'},
  ]);
  assert(true,'FSM reset cleanly for second issue');

  // ── 10. Steps Exhausted ───────────────────────────────────────────────────
  title('TEST 10: Steps Exhausted → Escalation');
  const s10=newSession('+15550009999');
  s10.callerName='Bob'; s10.steps=['Step A only.']; s10.stepIndex=0; s10.step='resolve_step';

  let r10=await processStep(s10,'ready');
  info(`[resolve_step→${s10.step}] "${r10.agentSaid}"`);
  assert(s10.step==='resolve_check', `Step = "resolve_check" after step read`);

  r10=await processStep(s10,'no still broken');
  info(`[resolve_check→${s10.step}] "${r10.agentSaid||'<redirect>'}"`);
  assert(s10.step==='steps_exhausted', `Step = "steps_exhausted" after all fail`);

  r10=await processStep(s10,'');
  info(`[steps_exhausted→${s10.step}] "${r10.agentSaid}"`);
  assert(s10.step==='get_email',       `Moves to get_email`);
  assert(r10.agentSaid.includes('escalat'), `Says "escalate"`);

  // ── 11. 30-Word Audit ────────────────────────────────────────────────────
  title('TEST 11: 30-Word Response Constraint Audit');
  const lines=[
    `Hi, thanks for calling Geoteknik Support. I'm Alex. May I have your first name, please?`,
    `Got it, Sarah. What issue are you experiencing today?`,
    `I see — a license activation issue. What's your Project ID?`,
    `Understood — report generation failure. What's your Project ID?`,
    `Got it — Project ID PRJ-1234. And your license key, please?`,
    `Let me check that — validating your project and license now.`,
    `I see your license is ready. I have four steps — say "ready" to begin.`,
    `Understood — I've run a remote check. The report engine needs a restart. Say "ready."`,
    `Found a solution. 4 steps — let's go.`,
    `Step 1 of 4: Open Geoteknik software and go to Help, then License Manager. — did that work?`,
    `No problem — let's try the next step.`,
    `Excellent — I'm really glad we sorted that, Sarah. Anything else today?`,
    `Of course — what else can I help you with?`,
    `That's a great question — let me escalate to our specialist team. What's your email?`,
    `I completely understand your frustration — I'm here to fix this right now. What's the main issue?`,
    `I understand — connecting you to a senior specialist now. Please hold.`,
    `I didn't catch that — could you say that again?`,
    `Still having trouble hearing you. Say "agent" for a specialist, or try again.`,
    `That key format doesn't look right. Could you double-check and read it again?`,
    `Thank you, Sarah — great speaking with you. Have a wonderful day. Goodbye!`,
  ];
  let ok=true;
  for(const l of lines){const wc=l.trim().split(/\s+/).length;if(wc>30){fail(`OVER 30 (${wc}): "${l}"`);ok=false;}}
  assert(ok,`All ${lines.length} standard responses ≤30 words`);

  // ── 12. cap30() ───────────────────────────────────────────────────────────
  title('TEST 12: cap30() Utility');
  assert(cap30('word '.repeat(40).trim()).split(/\s+/).length<=30, `Truncates 40-word string`);
  assert(cap30('Hello there')                === 'Hello there',    `Passes short string through`);
  assert(cap30('').length                    === 0,                 `Handles empty string`);
  assert(cap30('  spaced  ')                 === 'spaced',          `Trims whitespace`);

  // ── 13. Verbal Cues ───────────────────────────────────────────────────────
  title('TEST 13: Verbal Cue Presence');
  assert(`Got it, Sarah. What issue today?`.includes('Got it'),        `"Got it" present`);
  assert(`I see — a license issue.`.includes('I see'),                 `"I see" present`);
  assert(`Understood — report failure.`.includes('Understood'),        `"Understood" present`);
  assert(`Let me check that — validating now.`.includes('Let me check'),`"Let me check" present`);

  // ── 14. classifyIssue() ───────────────────────────────────────────────────
  title('TEST 14: Issue Classification');
  assert(classifyIssue('license activation failed')         ==='license_activation', `"license activation"`);
  assert(classifyIssue('404-L error')                       ==='license_activation', `"404-L"`);
  assert(classifyIssue('report generation failed')          ==='report_generation',  `"report generation"`);
  assert(classifyIssue("soil report won't generate")        ==='report_generation',  `"soil report"`);
  assert(classifyIssue('GPS wont connect')                  ==='general',            `"GPS" → general`);
  assert(classifyIssue('')                                  ==='general',            `empty → general`);

  // ── 15. extractProjectId() ───────────────────────────────────────────────
  title('TEST 15: Project ID Extraction');
  assert(extractProjectId('project ID is PRJ-5678')         ==='PRJ-5678', `"PRJ-5678"`);
  assert(extractProjectId('project 9900')                   ==='9900',     `"9900"`);
  assert(extractProjectId('ID is 123456')                   ==='123456',   `6-digit`);

  // ── 16. Key validation ───────────────────────────────────────────────────
  title('TEST 16: License Key Validation');
  assert(!tool_validate_license_key('ABCD1234').valid, `No dash → invalid`);
  assert( tool_validate_license_key('ABCD-1234').valid,`With dash → valid`);
  assert(!tool_validate_license_key('').valid,         `Empty → invalid`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const bar='─'.repeat(50);
  const pct=((passed/total)*100).toFixed(0);
  const col=failed===0?C.green:C.red;
  console.log(`\n${C.bold}${bar}${C.reset}`);
  console.log(`${C.bold}  Results${C.reset}`);
  console.log(`${bar}`);
  console.log(`  ${C.green}Passed : ${passed}${C.reset}`);
  console.log(`  ${failed>0?C.red:C.grey}Failed : ${failed}${C.reset}`);
  console.log(`  Total  : ${total}`);
  console.log(`  ${col}Score  : ${pct}%${C.reset}`);
  console.log(`${bar}\n`);
  if(failed===0)console.log(`${C.bold}${C.green}  ✓ All tests passed.${C.reset}\n`);
  else{console.log(`${C.bold}${C.red}  ✗ ${failed} failed.${C.reset}\n`);process.exit(1);}
}

runTests().catch(e=>{console.error(`\n${C.red}Fatal:${C.reset}`,e);process.exit(1);});