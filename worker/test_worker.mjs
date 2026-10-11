import worker from "./worker.js";
let calls = [];
const env = { APP_TOKEN: "t", GEMINI_API_KEY: "g", GROQ_API_KEY: "q",
  GEMINI_MODELS: "gem-a,gem-b", GROQ_MODELS: "openai/gpt-oss-120b" };
const q = JSON.stringify({question:"What did you mostly use it for?",options:["Eggs","Curries","Dosa"],multi:true});
const s = JSON.stringify({headline:"h",summary:"I used it for two months.",points:["Used for eggs."]});
function mock(plan){ calls=[]; globalThis.fetch = async (url, opts)=>{
  const name = url.includes("generativelanguage") ? "gem:"+url.split("models/")[1].split(":")[0] : "groq:"+JSON.parse(opts.body).model;
  calls.push(name + (opts.body.includes("reasoning_effort")?"+re":""));
  const r = plan(name); return new Response(r.body, {status:r.status||200});
};}
const gemOk = (t)=>({body: JSON.stringify({candidates:[{content:{parts:[{text:t}]}}]})});
const groqOk = (t)=>({body: JSON.stringify({choices:[{message:{content:t}}]})});
const post = (b, tok="t")=>worker.fetch(new Request("https://x/",{method:"POST",headers:{"X-App-Token":tok},body:JSON.stringify(b)}), env);
const P={title:"Pan",brand:"B",details:"d"};
let ok=0, fail=0; const t=(n,c)=>{ (c?ok++:fail++); console.log((c?"PASS ":"FAIL ")+n); };

mock(n=>n.startsWith("gem")?gemOk(q):groqOk(q));
let r = await post({mode:"question",step:1,product:P,duration:"1-4 weeks",qa:[]}); let j=await r.json();
t("gemini first answer", r.status===200 && j.via==="gem-a" && j.multi===true && calls.length===1);

mock(n=>n==="gem:gem-a"?{status:429,body:"{}"}:n==="gem:gem-b"?gemOk("```json\n"+q+"\n```"):groqOk(q));
j=await (await post({mode:"question",step:2,product:P,duration:"x",qa:[{q:"a",a:"b"}]})).json();
t("429 then second gemini model (fenced JSON parsed)", j.via==="gem-b" && calls.length===2 && j.notes[0]==="gem-a: HTTP 429");

mock(n=>n.startsWith("gem")?{status:404,body:"{}"}:groqOk(q));
j=await (await post({mode:"question",step:1,product:P,duration:"x",qa:[]})).json();
t("all gemini fail -> groq, reasoning_effort set", j.via==="openai/gpt-oss-120b" && calls[2].endsWith("+re"));

mock(n=>n.startsWith("gem")?gemOk("not json at all"):groqOk('{"question":"x","options":["a"]}'));
r = await post({mode:"question",step:1,product:P,duration:"x",qa:[]}); j=await r.json();
t("bad outputs everywhere -> 502 with detail", r.status===502 && j.detail.length===3);

mock(n=>n.startsWith("gem")?gemOk(s):groqOk(s));
j=await (await post({mode:"summary",product:P,duration:"x",qa:[{q:"a",a:"b"}]})).json();
t("summary ok", j.summary && j.points.length===1 && j.via==="gem-a");

r = await post({mode:"question",step:1,product:P,duration:"x",qa:[]},"wrong"); t("wrong token 401", r.status===401);
r = await post({mode:"question",step:3,product:P,duration:"x",qa:[]}); t("step/qa mismatch 400", r.status===400);
r = await post({mode:"question",step:6,product:P,duration:"x",qa:[1,2,3,4,5]}); t("step 6 rejected", r.status===400);
r = await post({mode:"question",step:1,product:{},duration:"x",qa:[]}); t("missing title 400", r.status===400);
r = await worker.fetch(new Request("https://x/",{method:"OPTIONS"}), env); t("OPTIONS 204", r.status===204);
r = await worker.fetch(new Request("https://x/",{method:"GET"}), env); t("GET 405", r.status===405);
r = await worker.fetch(new Request("https://x/",{method:"POST",headers:{"X-App-Token":"t"},body:"{bad"}), env); t("bad json 400", r.status===400);
// qa with null entry must not crash
mock(n=>gemOk(q)); r = await post({mode:"question",step:2,product:P,duration:"x",qa:[null]}); t("null qa entry safe", r.status===200);

// ---- v2 additions ----
let seen = "";
globalThis.fetch = async (url, opts) => { seen = opts.body; return new Response(gemOk(q).body, {status:200}); };
await post({mode:"question",step:1,product:{title:"Kurti",brand:"B",details:"d",site:"Myntra"},duration:"x",qa:[]});
t("site name reaches the prompt", seen.includes("Site: Myntra"));
await post({mode:"question",step:1,product:P,duration:"x",qa:[]});
t("old payload without site still works", true);

mock(n=>gemOk(JSON.stringify({headline:"h",summary:"I wore it for a week and it fits well.",points:[]})));
j=await (await post({mode:"summary",product:P,duration:"x",qa:[{q:"a",a:"b"}]})).json();
t("paragraph-only summary accepted", j.summary.length>10 && j.points.length===0 && !!j.via);

mock(n=>gemOk(JSON.stringify({headline:"h",summary:"",points:["Fits well.","Colour as shown."]})));
j=await (await post({mode:"summary",product:P,duration:"x",qa:[{q:"a",a:"b"}]})).json();
t("bullets-only summary accepted", j.summary==="" && j.points.length===2);

mock(n=>n.startsWith("gem")?gemOk(JSON.stringify({headline:"h",summary:"",points:[]})):groqOk(s));
j=await (await post({mode:"summary",product:P,duration:"x",qa:[{q:"a",a:"b"}]})).json();
t("empty summary rejected, falls to next model", j.via==="openai/gpt-oss-120b");
console.log(ok+" passed, "+fail+" failed");
