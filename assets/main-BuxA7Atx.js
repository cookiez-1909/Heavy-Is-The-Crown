import{N as Ue,r as b,R as Re,j as e,c as en,C as Be,n as v,d as L,S as R,a as we,b as tn,L as nn,D as sn,e as rn,A as E,f as He,s as de,p as Et,g as De,h as Se,t as $,i as an,E as _t,k as xe,l as on,M as ln,m as cn,o as dn,W as Qe,T as Xe,q as hn,u as un}from"./hitc-Dtwpy2Is.js";var We={},J={},Ze;function It(){if(Ze)return J;Ze=1,Object.defineProperty(J,"__esModule",{value:!0}),J.LocalStorage=void 0;class t{async get(n){return typeof window>"u"?null:localStorage.getItem(n)}async set(n,l){typeof window>"u"||localStorage.setItem(n,l)}async remove(n){typeof window>"u"||localStorage.removeItem(n)}}return J.LocalStorage=t,J}var Q={},X={},ye={},et;function mn(){if(et)return ye;et=1,Object.defineProperty(ye,"__esModule",{value:!0}),ye.encodeBase58=r;const t="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";function r(n){if(n.length===0)return"";let l=0,o=0;for(;o<n.length&&n[o]===0;)l++,o++;let a=[0];for(;o<n.length;o++){let i=n[o];for(let d=0;d<a.length;++d)i+=a[d]<<8,a[d]=i%58,i=i/58|0;for(;i>0;)a.push(i%58),i=i/58|0}for(;a.length>0&&a[a.length-1]===0;)a.pop();let s="";for(let i=0;i<l;i++)s+=t[0];for(let i=a.length-1;i>=0;--i)s+=t[a[i]];return s}return ye}var tt;function $e(){if(tt)return X;tt=1,Object.defineProperty(X,"__esModule",{value:!0}),X.nearActionsToConnectorActions=void 0;const t=mn(),r=a=>{try{return JSON.parse(new TextDecoder().decode(a))}catch{return a}},n=a=>a.enum!=null?a.enum==="fullAccess":"fullAccess"in a,l=a=>a.enum!=null?a.enum==="AccountId":"AccountId"in a,o=a=>a.map(s=>{if("type"in s)return s;if(s.signedDelegate)throw new Error("SignedDelegate actions cannot be sent through the wallet connector; wallets sign delegates via signDelegateActions");if(s.functionCall)return{type:"FunctionCall",params:{methodName:s.functionCall.methodName,args:r(s.functionCall.args),gas:s.functionCall.gas.toString(),deposit:s.functionCall.deposit.toString()}};if(s.deployGlobalContract)return{type:"DeployGlobalContract",params:{code:s.deployGlobalContract.code,deployMode:l(s.deployGlobalContract.deployMode)?"AccountId":"CodeHash"}};if(s.createAccount)return{type:"CreateAccount"};if(s.useGlobalContract){const i=s.useGlobalContract.contractIdentifier;return{type:"UseGlobalContract",params:{contractIdentifier:i.AccountId!=null?{accountId:i.AccountId}:{codeHash:(0,t.encodeBase58)(i.CodeHash)}}}}if(s.deployContract)return{type:"DeployContract",params:{code:s.deployContract.code}};if(s.deleteAccount)return{type:"DeleteAccount",params:{beneficiaryId:s.deleteAccount.beneficiaryId}};if(s.deleteKey)return{type:"DeleteKey",params:{publicKey:s.deleteKey.publicKey.toString()}};if(s.transfer)return{type:"Transfer",params:{deposit:s.transfer.deposit.toString()}};if(s.stake)return{type:"Stake",params:{stake:s.stake.stake.toString(),publicKey:s.stake.publicKey.toString()}};if(s.addKey){const{permission:i}=s.addKey.accessKey;let d;if(i.functionCall)d={receiverId:i.functionCall.receiverId,allowance:i.functionCall.allowance?.toString(),methodNames:i.functionCall.methodNames};else if(n(i))d="FullAccess";else throw new Error("Unsupported access-key permission on AddKey: only functionCall and fullAccess can be sent through the wallet connector (pass a ConnectorAction otherwise)");return{type:"AddKey",params:{publicKey:s.addKey.publicKey.toString(),accessKey:{nonce:Number(s.addKey.accessKey.nonce),permission:d}}}}throw new Error("Unsupported action type")});return X.nearActionsToConnectorActions=o,X}var Le={},nt;function Ee(){return nt||(nt=1,(function(t){Object.defineProperty(t,"__esModule",{value:!0}),t.isGasKeyAction=void 0,t.assertGasKeyActionsSupported=n;const r=l=>l.type==="TransferToGasKey"||l.type==="WithdrawFromGasKey"||l.type==="AddKey"&&l.params.gasKeyInfo!=null;t.isGasKeyAction=r;function n(l,o,a){if(l?.gasKeys)return;const s=o.filter(t.isGasKeyAction).map(i=>i.type);if(s.length!==0)throw new Error(`${a} does not advertise gas-key support (manifest features.gasKeys), so ${[...new Set(s)].join(", ")} cannot be sent through it; a wallet that does not know gasKeyInfo could add a plain key instead. Sign locally with a full-access key, or use a wallet whose manifest sets features.gasKeys.`)}})(Le)),Le}var Z={},st;function ze(){if(st)return Z;st=1,Object.defineProperty(Z,"__esModule",{value:!0}),Z.uuid4=void 0;const t=()=>typeof window<"u"&&typeof window.crypto<"u"&&typeof window.crypto.randomUUID=="function"?window.crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(r){const n=Math.random()*16|0;return(r==="x"?n:n&3|8).toString(16)});return Z.uuid4=t,Z}var rt;function Pt(){if(rt)return Q;rt=1,Object.defineProperty(Q,"__esModule",{value:!0}),Q.ParentFrameWallet=void 0;const t=$e(),r=Ee(),n=ze();let l=class{connector;manifest;constructor(a,s){this.connector=a,this.manifest=s}callParentFrame(a,s){const i=(0,n.uuid4)();return window.parent.postMessage({type:"near-wallet-injected-request",id:i,method:a,params:s},"*"),new Promise((d,u)=>{const f=m=>{m.data.type==="near-wallet-injected-response"&&m.data.id===i&&(window.removeEventListener("message",f),m.data.success?d(m.data.result):u(m.data.error))};window.addEventListener("message",f)})}async signIn(a){const s=await this.callParentFrame("near:signIn",{network:a?.network??this.connector.network,addFunctionCallKey:a?.addFunctionCallKey});return Array.isArray(s)?s:[s]}async signInAndSignMessage(a){const s=await this.callParentFrame("near:signInAndSignMessage",{network:a?.network??this.connector.network,addFunctionCallKey:a?.addFunctionCallKey,messageParams:a.messageParams});return Array.isArray(s)?s:[s]}async signOut(a){const s={...a,network:a?.network??this.connector.network};await this.callParentFrame("near:signOut",s)}async getAccounts(a){const s={...a,network:a?.network??this.connector.network};return this.callParentFrame("near:getAccounts",s)}async signAndSendTransaction(a){const s=(0,t.nearActionsToConnectorActions)(a.actions);(0,r.assertGasKeyActionsSupported)(this.manifest.features,s,this.manifest.name);const i={...a,actions:s,network:a.network??this.connector.network};return this.callParentFrame("near:signAndSendTransaction",i)}async signAndSendTransactions(a){const s=a.transactions.map(d=>({actions:(0,t.nearActionsToConnectorActions)(d.actions),receiverId:d.receiverId}));(0,r.assertGasKeyActionsSupported)(this.manifest.features,s.flatMap(d=>d.actions),this.manifest.name);const i={...a,transactions:s,network:a.network??this.connector.network};return this.callParentFrame("near:signAndSendTransactions",i)}async signMessage(a){const s={...a,network:a.network??this.connector.network};return this.callParentFrame("near:signMessage",s)}async signDelegateActions(a){const s={...a,delegateActions:a.delegateActions.map(i=>({...i,actions:(0,t.nearActionsToConnectorActions)(i.actions)})),network:a.network||this.connector.network};return(0,r.assertGasKeyActionsSupported)(this.manifest.features,s.delegateActions.flatMap(i=>i.actions),this.manifest.name),this.callParentFrame("near:signDelegateActions",s)}};return Q.ParentFrameWallet=l,Q}var M={},H={},ee={},at;function Tt(){if(at)return ee;at=1,Object.defineProperty(ee,"__esModule",{value:!0}),ee.parseUrl=void 0;const t=r=>{try{return new URL(r)}catch{return null}};return ee.parseUrl=t,ee}var te={},ot;function fn(){if(ot)return te;ot=1,Object.defineProperty(te,"__esModule",{value:!0}),te.copyText=void 0;const t=async r=>{try{await navigator.clipboard.writeText(r);return}catch{}const n=document.createElement("textarea");n.value=r,n.setAttribute("readonly",""),n.style.position="fixed",n.style.opacity="0",document.body.appendChild(n),n.select();try{if(!document.execCommand("copy"))throw new Error("Copy failed")}finally{n.remove()}};return te.copyText=t,te}var T={},it;function pn(){if(it)return T;it=1,Object.defineProperty(T,"__esModule",{value:!0}),T.openExternalLink=T.openTelegramLink=T.isTelegramMiniApp=void 0;const t=()=>{const s=window?.Telegram?.WebApp;return!s||!s.platform||s.platform==="unknown"?null:s},r=()=>{try{return location.hash.includes("tgWebAppData")?!0:!!sessionStorage.getItem("__telegram__initParams")}catch{return!1}},n=()=>typeof window>"u"?!1:!!t()||!!window.TelegramWebviewProxy||r();T.isTelegramMiniApp=n;const l=(s,i)=>{const d=window.TelegramWebviewProxy;if(d?.postEvent)return d.postEvent(s,JSON.stringify(i));const u=window.external;if(u&&"notify"in u)return u.notify(JSON.stringify({eventType:s,eventData:i}));window.parent!==window&&window.parent.postMessage(JSON.stringify({eventType:s,eventData:i}),"https://web.telegram.org")},o=s=>{const i=t();if(i)return i.openTelegramLink(s.toString());l("web_app_open_tg_link",{path_full:s.pathname+s.search})};T.openTelegramLink=o;const a=s=>{const i=t();if(i)return i.openLink(s.toString());l("web_app_open_link",{url:s.toString()})};return T.openExternalLink=a,T}var z={},ne={},lt;function Mt(){if(lt)return ne;lt=1,Object.defineProperty(ne,"__esModule",{value:!0}),ne.EventEmitter=void 0;class t{events={};on(n,l){this.events[n]||(this.events[n]=[]),this.events[n].push(l)}emit(n,l){this.events[n]?.forEach(o=>o(l))}off(n,l){this.events[n]=this.events[n]?.filter(o=>o!==l)}once(n,l){const o=a=>{l(a),this.off(n,o)};this.on(n,o)}removeAllListeners(n){n?delete this.events[n]:this.events={}}}return ne.EventEmitter=t,ne}var se={},re={},ct;function Ge(){if(ct)return re;ct=1,Object.defineProperty(re,"__esModule",{value:!0}),re.escapeHtml=t,re.html=n;function t(l){return l.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}const r=Symbol("htmlTag");function n(l,...o){let a=l[0];for(let s=0;s<o.length;s++){for(const i of Array.isArray(o[s])?o[s]:[o[s]]){const d=i?.[r]?i[r]:t(String(i??""));a+=d}a+=l[s+1]}return Object.freeze({[r]:a,get html(){return a}})}return re}var ae={},oe={},dt;function gn(){if(dt)return oe;dt=1,Object.defineProperty(oe,"__esModule",{value:!0}),oe.css=void 0;const t=r=>`
${r} * {
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  -ms-overflow-style: none; 
  scrollbar-width: none; 
  color: #fff;
}

${r} *::-webkit-scrollbar { 
  display: none;
}

${r} p,
${r} h1,
${r} h2,
${r} h3,
${r} h4,
${r} h5,
${r} h6 {
  margin: 0;
}

${r} .modal-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 100000000;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    transition: opacity 0.2s ease-in-out;
}

@media (max-width: 600px) {
  ${r} .modal-container {
    justify-content: flex-end;
  }
}

${r} .modal-content {
  display: flex;
  flex-direction: column;
  align-items: center;

  max-width: 420px;
  max-height: 615px;
  width: 100%;
  border-radius: 24px;
  background: #0d0d0d;
  border: 1.5px solid rgba(255, 255, 255, 0.1);
  transition: transform 0.2s ease-in-out;
}

@media (max-width: 600px) {
  ${r} .modal-content {
    max-width: 100%;
    width: 100%;
    max-height: 80%;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border: none;
    border-top: 1.5px solid rgba(255, 255, 255, 0.1);
  }
}


${r} .modal-header {
  display: flex;
  padding: 16px;
  gap: 16px;
  align-self: stretch;
  align-items: center;
  justify-content: center;
  position: relative;
}

${r} .modal-header button {
  position: absolute;
  right: 16px;
  top: 16px;
  width: 32px;
  height: 32px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s ease-in-out;
  border: none;
  background: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

${r} .modal-header button:hover {
  background: rgba(255, 255, 255, 0.04);
}
  
${r} .modal-header p {
  color: #fff;
  text-align: center;
  font-size: 24px;
  font-style: normal;
  font-weight: 600;
  line-height: normal;
  margin: 0;
}


${r} .modal-body {
  display: flex;
  padding: 16px;
  flex-direction: column;
  align-items: flex-start;
  text-align: center;
  gap: 8px;
  overflow: auto;

  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
  width: 100%;
  flex: 1;
}

${r} .modal-body textarea {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  background: #0d0d0d;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  outline: none;
  font-size: 16px;
  transition: background 0.2s ease-in-out;
  font-family: monospace;
  font-size: 12px;
}

${r} .modal-body button {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  background: #fff;
  color: #000;
  border: none;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.2s ease-in-out;
  margin-top: 16px;
}

${r} .footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 16px 24px;
  color: #fff;
  gap: 12px;
}

${r} .modal-body p {
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  font-size: 16px;
  font-style: normal;
  font-weight: 500;
  line-height: normal;
  letter-spacing: -0.8px;
}

${r} .footer img {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

${r} .get-wallet-link {
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  font-size: 16px;
  font-style: normal;
  font-weight: 500;
  margin-left: auto;
  text-decoration: none;
  transition: color 0.2s ease-in-out;
  cursor: pointer;
}
  
${r} .get-wallet-link:hover {
  color: rgba(255, 255, 255, 1);
}


${r} .connect-item {
  display: flex;
  padding: 8px;
  align-items: center;
  gap: 12px;
  align-self: stretch;
  cursor: pointer;

  transition: background 0.2s ease-in-out;
  border-radius: 24px;
}

${r} .connect-item img {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  object-fit: cover;
  flex-shrink: 0;
}

${r} .connect-item-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
  flex: 1;
  margin-top: -2px;
}

${r} .connect-item-info .wallet-address {
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  font-style: normal;
  font-weight: 400;
  line-height: normal;
}

${r} .connect-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

${r} .connect-item img {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  object-fit: cover;
}

${r} .connect-item p {
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  font-size: 18px;
  font-style: normal;
  font-weight: 600;
  line-height: normal;
  letter-spacing: -0.36px;
  margin: 0;
}
`;return oe.css=t,oe}var ht;function Rt(){if(ht)return ae;ht=1,Object.defineProperty(ae,"__esModule",{value:!0}),ae.Popup=void 0;const t=gn(),r=Ge(),n=`n${Math.random().toString(36).substring(2,15)}`;if(typeof document<"u"){const o=document.createElement("style");o.textContent=(0,t.css)(`.${n}`),document.head.append(o)}let l=class{delegate;isClosed=!1;root=document.createElement("div");state={};constructor(a){this.delegate=a}get dom(){return(0,r.html)``}disposables=[];addListener(a,s,i){const d=typeof a=="string"?this.root.querySelector(a):a;d&&(d.addEventListener(s,i),this.disposables.push(()=>d.removeEventListener(s,i)))}handlers(){this.disposables.forEach(d=>d()),this.disposables=[];const a=this.root.querySelector(".modal-container"),s=this.root.querySelector(".modal-content");s.onclick=d=>d.stopPropagation(),a.onclick=()=>{this.delegate.onReject(),this.destroy()};const i=d=>{d.key==="Escape"&&(this.delegate.onReject(),this.destroy())};document.addEventListener("keydown",i),this.disposables.push(()=>document.removeEventListener("keydown",i))}update(a){this.state={...this.state,...a},this.root.innerHTML=this.dom.html,this.handlers()}create({show:a=!0}){this.root.className=`${n} hot-connector-popup`,this.root.style.display="none",this.root.innerHTML=this.dom.html,document.body.append(this.root),this.handlers();const s=this.root.querySelector(".modal-container"),i=this.root.querySelector(".modal-content");i.style.transform="translateY(50px)",s.style.opacity="0",a&&setTimeout(()=>this.show(),10)}show(){const a=this.root.querySelector(".modal-container"),s=this.root.querySelector(".modal-content");s.style.transform="translateY(50px)",a.style.opacity="0",this.root.style.display="block",setTimeout(()=>{s.style.transform="translateY(0)",a.style.opacity="1"},100)}hide(){const a=this.root.querySelector(".modal-container"),s=this.root.querySelector(".modal-content");s.style.transform="translateY(50px)",a.style.opacity="0",setTimeout(()=>{this.root.style.display="none"},200)}destroy(){this.isClosed||(this.isClosed=!0,this.disposables.forEach(a=>a()),this.disposables=[],this.hide(),setTimeout(()=>{this.root.remove()},200))}};return ae.Popup=l,ae}var ut;function wn(){if(ut)return se;ut=1,Object.defineProperty(se,"__esModule",{value:!0}),se.IframeWalletPopup=void 0;const t=Ge(),r=Rt();let n=class extends r.Popup{delegate;constructor(o){super(o),this.delegate=o}handlers(){super.handlers(),this.addListener("button","click",()=>this.delegate.onApprove())}create(){super.create({show:!1}),this.root.querySelector(".modal-body").appendChild(this.delegate.iframe),this.delegate.iframe.style.width="100%",this.delegate.iframe.style.height="720px",this.delegate.iframe.style.border="none"}get footer(){if(!this.delegate.footer)return"";const{icon:o,heading:a}=this.delegate.footer;return(0,t.html)`
      <div class="footer">
        ${o?(0,t.html)`<img src="${o}" alt="${a}" />`:""}
        <p>${a}</p>
      </div>
    `}get dom(){return(0,t.html)`<div class="modal-container">
      <div class="modal-content">
        <div class="modal-body" style="padding: 0; overflow: auto;"></div>
        ${this.footer}
      </div>
    </div>`}};return se.IframeWalletPopup=n,se}var be={},ie={},mt;function xn(){return mt||(mt=1,Object.defineProperty(ie,"__esModule",{value:!0}),ie.NEAR_CONNECT_VERSION=void 0,ie.NEAR_CONNECT_VERSION="0.12.0"),ie}var ft;function yn(){if(ft)return be;ft=1,Object.defineProperty(be,"__esModule",{value:!0});const t=xn();async function r(n){const l=await n.executor.getAllStorage(),o=n.executor.connector.providers,a=n.executor.manifest,s=n.id,i=n.code.replaceAll(".localStorage",".sandboxedLocalStorage").replaceAll("window.top","window.selector").replaceAll("window.open","window.selector.open"),d=n.cspNonce?` nonce="${n.cspNonce.replace(/[^A-Za-z0-9+/=]/g,"")}"`:"";return`
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
      <div id="root"></div>

      <style>
        :root {
          --background-color: rgb(40, 40, 40);
          --text-color: rgb(255, 255, 255);
          --border-color: rgb(209, 209, 209);
        }

        * {
          font-family: system-ui, Avenir, Helvetica, Arial, sans-serif
        }

        body, html {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          background-color: var(--background-color);
          color: var(--text-color);
        }

        #root {
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          width: 100vw;
          background: radial-gradient(circle at center, #2c2c2c 0%, #1a1a1a 100%);
          text-align: center;
        }

        #root * {
          box-sizing: border-box;
          font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
          line-height: 1.5;
          color-scheme: light dark;
          color: rgb(255, 255, 255);
          font-synthesis: none;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
        }

        .prompt-container img {
          width: 100px;
          height: 100px;
          object-fit: cover;
          border-radius: 12px;
        }

        .prompt-container h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
          margin-top: 16px;
        }

        .prompt-container p {
          margin: 0;
          font-size: 16px;
          font-weight: 500;
          color: rgb(209, 209, 209);
        }

        .prompt-container button {
          background-color: #131313;
          border: none;
          border-radius: 12px;
          padding: 12px 24px;
          cursor: pointer;
          transition: border-color 0.25s;
          color: #fff;
          outline: none;
          font-size: 14px;
          font-weight: 500;
          font-family: inherit;
          margin-top: 16px;
        }
      </style>


      <script${d}>
      window.sandboxedLocalStorage = (() => {
        let storage = ${JSON.stringify(l)}

        return {
          setItem: function(key, value) {
            window.selector.storage.set(key, value)
            storage[key] = value || '';
          },
          getItem: function(key) {
            return key in storage ? storage[key] : null;
          },
          removeItem: function(key) {
            window.selector.storage.remove(key)
            delete storage[key];
          },
          get length() {
            return Object.keys(storage).length;
          },
          key: function(i) {
            const keys = Object.keys(storage);
            return keys[i] || null;
          },
        };
      })();

      const showPrompt = async (args) => {
        const root = document.getElementById("root");   
        root.style.display = "flex";
        root.innerHTML = \`
          <div class="prompt-container">
            <img src="${a.icon}" />
            <h1>${a.name}</h1>
            <p>\${args.title}</p>
            <button>\${args.button}</button>
          </div>
        \`;

        return new Promise((resolve) => {
          root.querySelector("button")?.addEventListener("click", () => {
            root.innerHTML = "";
            resolve(true);
          });
        });
      }

      class ProxyWindow {
        constructor(url, features) {
          this.closed = false;
          this.windowIdPromise = window.selector.call("open", { url, features });

          window.addEventListener("message", async (event) => {            
            if (event.data.origin !== "${s}") return;
            if (!event.data.method?.startsWith("proxy-window:")) return;
            const method = event.data.method.replace("proxy-window:", "");
            if (method === "closed" && event.data.windowId === await this.id()) this.closed = true;
          });
        } 

        async id() {
          return await this.windowIdPromise;
        }

        async focus() {
          await window.selector.call("panel.focus", { windowId: await this.id() });
        }

        async postMessage(data) {
          window.selector.call("panel.postMessage", { windowId: await this.id(), data });
        }

        async close() {
          await window.selector.call("panel.close", { windowId: await this.id() });
        }
      }

      window.selector = {
        wallet: null,
        location: "${window.location.href}",
        nearConnectVersion: "${t.NEAR_CONNECT_VERSION}",
        
        outerHeight: ${window.outerHeight},
        screenY: ${window.screenY},
        outerWidth: ${window.outerWidth},
        screenX: ${window.screenX},

        providers: {
          mainnet: ${JSON.stringify(o.mainnet)},
          testnet: ${JSON.stringify(o.testnet)},
        },

        uuid() {
          return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
        },

        walletConnect: {
          connect(params) {
            return window.selector.call("walletConnect.connect", params);
          },
          disconnect(params) {
            return window.selector.call("walletConnect.disconnect", params);
          },
          request(params) {
            return window.selector.call("walletConnect.request", params);
          },
          getProjectId() {
            return window.selector.call("walletConnect.getProjectId", {});
          },
          getSession() {
            return window.selector.call("walletConnect.getSession", {});
          },
        },
      
        async ready(wallet) {
          wallet.manifest = ${JSON.stringify(a)};
          window.parent.postMessage({ method: "wallet-ready", origin: "${s}" }, "*");
          window.selector.wallet = wallet;
        },

        async call(method, params) {
          const id = window.selector.uuid();
          window.parent.postMessage({ method, params, id, origin: "${s}" }, "*");

          return new Promise((resolve, reject) => {
            const handler = (event) => {
              if (event.data.id !== id || event.data.origin !== "${s}") return;
              window.removeEventListener("message", handler);

              if (event.data.status === "failed") reject(event.data.result);
              else resolve(event.data.result);
            };

            window.addEventListener("message", handler);
          });
        },

        panelClosed(windowId) {
          window.parent.postMessage({ 
            method: "panel.closed", 
            origin: "${s}", 
            result: { windowId } 
          }, "*");
        },

        open(url, _, params) {
          return new ProxyWindow(url, params)
        },

        external(entity, key, ...args) {
          return window.selector.call("external", { entity, key, args: args || [] });
        },

        openNativeApp(url) {
          return window.selector.call("open.nativeApp", { url });
        },

        ui: {
          async whenApprove(options) {
            window.selector.ui.showIframe();
            await showPrompt(options);
            window.selector.ui.hideIframe();
          },

          async showIframe() {
            return await window.selector.call("ui.showIframe");
          },

          async hideIframe() {
            return await window.selector.call("ui.hideIframe");
          },
        },

        storage: {
          async set(key, value) {
            await window.selector.call("storage.set", { key, value });
          },
      
          async get(key) {
            return await window.selector.call("storage.get", { key });
          },
      
          async remove(key) {
            await window.selector.call("storage.remove", { key });
          },

          async keys() {
            return await window.selector.call("storage.keys", {});
          },
        },
      };

      // Clipboard API often rejects inside the sandbox (Android WebView), copy through the dApp page then.
      // Plain assignment to navigator.clipboard is a no-op (getter on the prototype), so redefine the method
      const clipboard = navigator.clipboard || {};
      const nativeWriteText = clipboard.writeText ? clipboard.writeText.bind(clipboard) : null;
      Object.defineProperty(clipboard, "writeText", {
        configurable: true,
        value: async (text) => {
          try {
            if (nativeWriteText) return await nativeWriteText(text);
          } catch {}
          await window.selector.call("clipboard.writeText", { text });
        },
      });
      if (!navigator.clipboard) Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });

      window.addEventListener("message", async (event) => {
        if (event.data.origin !== "${s}") return;
        if (!event.data.method?.startsWith("wallet:")) return;
      
        const wallet = window.selector.wallet;
        const method = event.data.method.replace("wallet:", "");
        const payload = { id: event.data.id, origin: "${s}", method };
      
        if (wallet == null || typeof wallet[method] !== "function") {
          const data = { ...payload, status: "failed", result: "Method not found" };
          window.parent.postMessage(data, "*");
          return;
        }
        
        try {
          const result = await wallet[method](event.data.params);
          window.parent.postMessage({ ...payload, status: "success", result }, "*");
        } catch (error) {
          const data = { ...payload, status: "failed", result: error };
          window.parent.postMessage(data, "*");
        }
      });
      <\/script>

      <script type="module"${d}>${i}<\/script>
    </body>
  </html>
    `}return be.default=r,be}var pt;function bn(){if(pt)return z;pt=1;var t=z&&z.__importDefault||function(s){return s&&s.__esModule?s:{default:s}};Object.defineProperty(z,"__esModule",{value:!0});const r=Mt(),n=ze(),l=wn(),o=t(yn());class a{executor;origin;disposed=!1;iframe=document.createElement("iframe");events=new r.EventEmitter;popup;handler;readyPromiseResolve;readyPromise=new Promise(i=>{this.readyPromiseResolve=i});constructor(i,d,u,f){this.executor=i,this.origin=(0,n.uuid4)(),this.handler=h=>{h.data.origin===this.origin&&(h.data.method==="wallet-ready"&&this.readyPromiseResolve(),u(this,h))},window.addEventListener("message",this.handler);const m=[];this.executor.checkPermissions("usb")&&m.push("usb *;"),this.executor.checkPermissions("hid")&&m.push("hid *;"),this.executor.checkPermissions("clipboardRead")&&m.push("clipboard-read;"),this.executor.checkPermissions("clipboardWrite")&&m.push("clipboard-write;"),this.executor.checkPermissions("bluetooth")&&m.push("bluetooth *;"),this.iframe.allow=m.join(" "),this.iframe.setAttribute("sandbox","allow-scripts"),(0,o.default)({id:this.origin,executor:this.executor,code:d,cspNonce:f}).then(h=>{this.executor.connector.logger?.log("Iframe code injected"),this.iframe.srcdoc=h}),this.popup=new l.IframeWalletPopup({footer:this.executor.connector.footerBranding,iframe:this.iframe,onApprove:()=>{},onReject:()=>{this.disposed=!0,window.removeEventListener("message",this.handler),this.events.emit("close",{}),this.popup.destroy()}}),this.popup.create()}on(i,d){this.events.on(i,d)}show(){this.popup.show()}hide(){this.popup.hide()}postMessage(i){if(this.disposed)return;const d=this.iframe.contentWindow;if(!d)throw new Error(`Iframe not loaded for ${i?.method??"unknown method"}`);d.postMessage({...i,origin:this.origin},"*")}dispose(){this.disposed=!0,window.removeEventListener("message",this.handler),this.popup.destroy()}}return z.default=a,z}var gt;function jn(){if(gt)return H;gt=1;var t=H&&H.__importDefault||function(d){return d&&d.__esModule?d:{default:d}};Object.defineProperty(H,"__esModule",{value:!0});const r=Tt(),n=ze(),l=fn(),o=pn(),a=t(bn()),s=(0,n.uuid4)();class i{connector;manifest;activePanels={};storageSpace;constructor(u,f){this.connector=u,this.manifest=f,this.storageSpace=f.id}checkPermissions(u,f){if(u==="walletConnect")return!!this.manifest.permissions.walletConnect;if(u==="external"){const m=this.manifest.permissions.external;return!m||!f?.entity?!1:m.includes(f.entity)}if(u==="allowsOpen"){const m=(0,r.parseUrl)(f?.url||""),h=this.manifest.permissions.allowsOpen;return!m||!h||!Array.isArray(h)||h.length===0?!1:h.some(g=>{const p=(0,r.parseUrl)(g);return!(!p||m.protocol!==p.protocol||p.hostname&&m.hostname!==p.hostname||p.pathname&&p.pathname!=="/"&&m.pathname!==p.pathname)})}return this.manifest.permissions[u]}assertPermissions(u,f,m){if(!this.checkPermissions(f,m.data.params))throw u.postMessage({...m.data,status:"failed",result:"Permission denied"}),new Error("Permission denied")}_onMessage=async(u,f)=>{const m=c=>{u.postMessage({...f.data,status:"success",result:c})},h=c=>{u.postMessage({...f.data,status:"failed",result:c})};if(f.data.method==="ui.showIframe"){u.show(),m(null);return}if(f.data.method==="ui.hideIframe"){u.hide(),m(null);return}if(f.data.method==="storage.set"){this.assertPermissions(u,"storage",f),localStorage.setItem(`${this.storageSpace}:${f.data.params.key}`,f.data.params.value),m(null);return}if(f.data.method==="storage.get"){this.assertPermissions(u,"storage",f);const c=localStorage.getItem(`${this.storageSpace}:${f.data.params.key}`);m(c);return}if(f.data.method==="storage.keys"){this.assertPermissions(u,"storage",f);const c=Object.keys(localStorage).filter(g=>g.startsWith(`${this.storageSpace}:`));m(c);return}if(f.data.method==="storage.remove"){this.assertPermissions(u,"storage",f),localStorage.removeItem(`${this.storageSpace}:${f.data.params.key}`),m(null);return}if(f.data.method==="panel.focus"){const c=this.activePanels[f.data.params.windowId];c&&c.focus(),m(null);return}if(f.data.method==="panel.postMessage"){const c=this.activePanels[f.data.params.windowId];c&&c.postMessage(f.data.params.data,"*"),m(null);return}if(f.data.method==="panel.close"){const c=this.activePanels[f.data.params.windowId];c&&c.close(),delete this.activePanels[f.data.params.windowId],m(null);return}if(f.data.method==="walletConnect.connect"){this.assertPermissions(u,"walletConnect",f);try{if(!this.connector.walletConnect)throw new Error("WalletConnect is not configured");const g=await(await this.connector.walletConnect).connect(f.data.params);g.approval(),m({uri:g.uri})}catch(c){h(c)}return}if(f.data.method==="walletConnect.getProjectId"){if(!this.connector.walletConnect)throw new Error("WalletConnect is not configured");this.assertPermissions(u,"walletConnect",f);const c=await this.connector.walletConnect;m(c.core.projectId);return}if(f.data.method==="walletConnect.disconnect"){this.assertPermissions(u,"walletConnect",f);try{if(!this.connector.walletConnect)throw new Error("WalletConnect is not configured");const g=await(await this.connector.walletConnect).disconnect(f.data.params);m(g)}catch(c){h(c)}return}if(f.data.method==="walletConnect.getSession"){this.assertPermissions(u,"walletConnect",f);try{if(!this.connector.walletConnect)throw new Error("WalletConnect is not configured");const c=await this.connector.walletConnect,g=c.session.keys[c.session.keys.length-1],p=g?c.session.get(g):null;m(p?{topic:p.topic,namespaces:p.namespaces}:null)}catch(c){h(c)}return}if(f.data.method==="walletConnect.request"){this.assertPermissions(u,"walletConnect",f);try{if(!this.connector.walletConnect)throw new Error("WalletConnect is not configured");const g=await(await this.connector.walletConnect).request(f.data.params);m(g)}catch(c){h(c)}return}if(f.data.method==="clipboard.writeText"){this.assertPermissions(u,"clipboardWrite",f);try{await(0,l.copyText)(f.data.params.text),m(null)}catch(c){h(c)}return}if(f.data.method==="external"){this.assertPermissions(u,"external",f);try{const{entity:c,key:g,args:p}=f.data.params,x=c.split(".").reduce((w,k)=>w[k],window);c==="nightly.near"&&g==="signTransaction"&&(p[0].encode=()=>p[0]);const j=typeof x[g]=="function"?await x[g](...p||[]):x[g];m(j)}catch(c){h(c)}return}if(f.data.method==="open"){this.assertPermissions(u,"allowsOpen",f);const c=(0,r.parseUrl)(f.data.params.url);if(c&&c.protocol==="https:"&&(0,o.isTelegramMiniApp)()){c.hostname==="t.me"?(0,o.openTelegramLink)(c):(0,o.openExternalLink)(c),m(null);return}const g=window.open(f.data.params.url,"_blank",f.data.params.features),p=g?(0,n.uuid4)():null,x=j=>{const w=(0,r.parseUrl)(f.data.params.url);w&&w.origin===j.origin&&u.postMessage(j.data)};if(m(p),window.addEventListener("message",x),g&&p){this.activePanels[p]=g;const j=setInterval(()=>{if(!g?.closed)return;window.removeEventListener("message",x);const w={method:"proxy-window:closed",windowId:p};delete this.activePanels[p],clearInterval(j);try{u.postMessage(w)}catch{}},500)}return}if(f.data.method==="open.nativeApp"){this.assertPermissions(u,"allowsOpen",f);const c=(0,r.parseUrl)(f.data.params.url);if(!c||["https","http","javascript:","file:","data:","blob:","about:"].includes(c.protocol))throw h("Invalid URL"),new Error("[open.nativeApp] Invalid URL");const p=document.createElement("iframe");p.src=f.data.params.url,p.style.display="none",document.body.appendChild(p),u.postMessage({...f.data,status:"success",result:null});return}};actualCode=null;async checkNewVersion(u,f){if(this.actualCode)return this.connector.logger?.log("New version of code already checked"),this.actualCode;let m=(0,r.parseUrl)(u.manifest.executor);if(m||(m=(0,r.parseUrl)(location.origin+u.manifest.executor)),!m)throw new Error("Invalid executor URL");m.searchParams.set("nonce",s);const h=await fetch(m.toString()).then(c=>{if(!c.ok)throw new Error(`Failed to load executor: ${c.status}`);return c.text()});return this.connector.logger?.log("New version of code fetched"),this.actualCode=h,h===f?(this.connector.logger?.log("New version of code is the same as the current version"),this.actualCode):(await this.connector.db.setItem(`${this.manifest.id}:${this.manifest.version}`,h).then(()=>this.connector.logger?.log("New version of code saved to cache")).catch(c=>this.connector.logger?.log("Failed to cache new version of code",c)),h)}async loadCode(){const u=await this.connector.db.getItem(`${this.manifest.id}:${this.manifest.version}`).catch(()=>null);this.connector.logger?.log("Code loaded from cache",u!==null);const f=this.checkNewVersion(this,u);return u||await f}async call(u,f){this.connector.logger?.log("Add to queue",u,f),this.connector.logger?.log("Calling method",u,f);const m=await this.loadCode();this.connector.logger?.log("Code loaded, preparing");const h=new a.default(this,m,this._onMessage,this.connector.cspNonce);this.connector.logger?.log("Code loaded, iframe initialized"),await h.readyPromise,this.connector.logger?.log("Iframe ready");const c=(0,n.uuid4)();return new Promise((g,p)=>{try{const x=j=>{j.data.id!==c||j.data.origin!==h.origin||(h.dispose(),window.removeEventListener("message",x),this.connector.logger?.log("postMessage",{result:j.data,request:{method:u,params:f}}),j.data.status==="failed"?p(j.data.result):g(j.data.result))};window.addEventListener("message",x),h.postMessage({method:u,params:f,id:c}),h.on("close",()=>p(new Error("Wallet closed")))}catch(x){this.connector.logger?.log("Iframe error",x),p(x)}})}async getAllStorage(){const u=Object.keys(localStorage).filter(m=>m.startsWith(`${this.storageSpace}:`)),f={};for(const m of u)f[m.replace(`${this.storageSpace}:`,"")]=localStorage.getItem(m);return f}async clearStorage(){const u=Object.keys(localStorage).filter(f=>f.startsWith(`${this.storageSpace}:`));for(const f of u)localStorage.removeItem(f)}}return H.default=i,H}var wt;function Wt(){if(wt)return M;wt=1;var t=M&&M.__importDefault||function(a){return a&&a.__esModule?a:{default:a}};Object.defineProperty(M,"__esModule",{value:!0}),M.SandboxWallet=void 0;const r=$e(),n=Ee(),l=t(jn());class o{connector;manifest;executor;constructor(s,i){this.connector=s,this.manifest=i,this.executor=new l.default(s,i)}async signIn(s){return this.executor.call("wallet:signIn",{network:s?.network??this.connector.network,addFunctionCallKey:s?.addFunctionCallKey})}async signInAndSignMessage(s){return this.executor.call("wallet:signInAndSignMessage",{network:s?.network??this.connector.network,addFunctionCallKey:s?.addFunctionCallKey,messageParams:s.messageParams})}async signOut(s){const i={...s,network:s?.network??this.connector.network};await this.executor.call("wallet:signOut",i),await this.executor.clearStorage()}async getAccounts(s){const i={...s,network:s?.network??this.connector.network};return this.executor.call("wallet:getAccounts",i)}async signAndSendTransaction(s){const i=(0,r.nearActionsToConnectorActions)(s.actions);(0,n.assertGasKeyActionsSupported)(this.manifest.features,i,this.manifest.name);const d={...s,actions:i,network:s.network??this.connector.network};return this.executor.call("wallet:signAndSendTransaction",d)}async signAndSendTransactions(s){const i=s.transactions.map(u=>({actions:(0,r.nearActionsToConnectorActions)(u.actions),receiverId:u.receiverId}));(0,n.assertGasKeyActionsSupported)(this.manifest.features,i.flatMap(u=>u.actions),this.manifest.name);const d={...s,transactions:i,network:s.network??this.connector.network};return this.executor.call("wallet:signAndSendTransactions",d)}async signMessage(s){const i={...s,network:s.network??this.connector.network};return this.executor.call("wallet:signMessage",i)}async signDelegateActions(s){const i={...s,delegateActions:s.delegateActions.map(d=>({...d,actions:(0,r.nearActionsToConnectorActions)(d.actions)})),network:s.network??this.connector.network};return(0,n.assertGasKeyActionsSupported)(this.manifest.features,i.delegateActions.flatMap(d=>d.actions),this.manifest.name),this.executor.call("wallet:signDelegateActions",i)}}return M.SandboxWallet=o,M.default=o,M}var le={},xt;function Lt(){if(xt)return le;xt=1,Object.defineProperty(le,"__esModule",{value:!0}),le.InjectedWallet=void 0;const t=$e(),r=Ee();let n=class{connector;wallet;constructor(o,a){this.connector=o,this.wallet=a}get manifest(){return this.wallet.manifest}async signIn({addFunctionCallKey:o,network:a}){return this.wallet.signIn({network:a??this.connector.network,addFunctionCallKey:o})}async signInAndSignMessage(o){return this.wallet.signInAndSignMessage({network:o?.network??this.connector.network,addFunctionCallKey:o.addFunctionCallKey,messageParams:o.messageParams})}async signOut(o){await this.wallet.signOut({network:o?.network??this.connector.network})}async getAccounts(o){return this.wallet.getAccounts({network:o?.network??this.connector.network})}async signAndSendTransaction(o){const a=(0,t.nearActionsToConnectorActions)(o.actions);(0,r.assertGasKeyActionsSupported)(this.manifest.features,a,this.manifest.name);const s=o.network??this.connector.network,i=await this.wallet.signAndSendTransaction({...o,actions:a,network:s});if(!i)throw new Error("No result from wallet");return Array.isArray(i.transactions)?i.transactions[0]:i}async signAndSendTransactions(o){const a=o.network??this.connector.network,s=o.transactions.map(d=>({actions:(0,t.nearActionsToConnectorActions)(d.actions),receiverId:d.receiverId}));(0,r.assertGasKeyActionsSupported)(this.manifest.features,s.flatMap(d=>d.actions),this.manifest.name);const i=await this.wallet.signAndSendTransactions({...o,transactions:s,network:a});if(!i)throw new Error("No result from wallet");return Array.isArray(i.transactions)?i.transactions:i}async signMessage(o){return this.wallet.signMessage({...o,network:o.network??this.connector.network})}async signDelegateActions(o){const a=o.delegateActions.map(s=>({...s,actions:(0,t.nearActionsToConnectorActions)(s.actions)}));return(0,r.assertGasKeyActionsSupported)(this.manifest.features,a.flatMap(s=>s.actions),this.manifest.name),this.wallet.signDelegateActions({...o,delegateActions:a,network:o.network??this.connector.network})}};return le.InjectedWallet=n,le}var B={},ce={},yt;function vn(){if(yt)return ce;yt=1,Object.defineProperty(ce,"__esModule",{value:!0}),ce.NearWalletsPopup=void 0;const t=Ge(),r=Tt(),n=Rt(),l={id:"custom-wallet",name:"Custom Wallet",icon:"https://www.mynearwallet.com/images/webclip.png",description:"Custom wallet for NEAR.",website:"",version:"1.0.0",executor:"your-executor-url.js",type:"sandbox",platform:{},features:{signMessage:!0,signInWithoutAddKey:!0,signInAndSignMessage:!0,signAndSendTransaction:!0,signAndSendTransactions:!0,signDelegateActions:!0},permissions:{storage:!0,allowsOpen:[]}};let o=class extends n.Popup{delegate;constructor(s){super(s),this.delegate=s,this.update({wallets:s.wallets,showSettings:!1})}handlers(){super.handlers(),this.addListener(".settings-button","click",()=>this.update({showSettings:!0})),this.addListener(".back-button","click",()=>this.update({showSettings:!1})),this.root.querySelectorAll(".connect-item").forEach(s=>{s instanceof HTMLDivElement&&this.addListener(s,"click",()=>this.delegate.onSelect(s.dataset.type))}),this.root.querySelectorAll(".remove-wallet-button").forEach(s=>{s instanceof SVGSVGElement&&this.addListener(s,"click",async i=>{i.stopPropagation(),await this.delegate.onRemoveDebugManifest(s.dataset.type);const d=this.state.wallets.filter(u=>u.id!==s.dataset.type);this.update({wallets:d})})}),this.addListener(".add-debug-manifest-button","click",async()=>{try{const s=this.root.querySelector("#debug-manifest-input")?.value??"",i=await this.delegate.onAddDebugManifest(s);this.update({showSettings:!1,wallets:[i,...this.state.wallets]})}catch(s){alert(`Something went wrong: ${s}`)}})}create(){super.create({show:!0})}walletDom(s){const i=(0,t.html)`
      <svg
        class="remove-wallet-button"
        data-type="${s.id}"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style="margin-right: 4px;"
      >
        <path d="M18 6L6 18" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M6 6L18 18" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;return(0,t.html)`
      <div class="connect-item" data-type="${s.id}">
        <img style="background: #333" src="${s.icon}" alt="${s.name}" />
        <div class="connect-item-info">
          <span>${s.name}</span>
          <span class="wallet-address">${(0,r.parseUrl)(s.website)?.hostname}</span>
        </div>
        ${s.debug?i:""}
      </div>
    `}get footer(){if(!this.delegate.footer)return"";const{icon:s,heading:i,link:d,linkText:u}=this.delegate.footer;return(0,t.html)`
      <div class="footer">
        ${s?(0,t.html)`<img src="${s}" alt="${i}" />`:""}
        <p>${i}</p>
        <a class="get-wallet-link" href="${d}" target="_blank">${u}</a>
      </div>
    `}get dom(){return this.state.showSettings?(0,t.html)`
        <div class="modal-container">
          <div class="modal-content">
            <div class="modal-header">
              <button class="back-button" style="left: 16px; right: unset;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 18L9 12L15 6" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <p>Settings</p>
            </div>

            <div class="modal-body">
              <p style="text-align: left;">
                You can add your wallet to dapp for debug,
                <a href="https://github.com/azbang/hot-connector" target="_blank">read the documentation.</a> Paste your manifest and click "Add".
              </p>

              <textarea style="width: 100%;" id="debug-manifest-input" rows="10">${JSON.stringify(l,null,2)}</textarea>
              <button class="add-debug-manifest-button">Add</button>
            </div>

            ${this.footer}
          </div>
        </div>
      `:(0,t.html)`<div class="modal-container">
      <div class="modal-content">
        <div class="modal-header">
          <p>Select wallet</p>
          <button class="settings-button">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.5)" />
              <circle cx="19" cy="12" r="2" fill="rgba(255,255,255,0.5)" />
              <circle cx="5" cy="12" r="2" fill="rgba(255,255,255,0.5)" />
            </svg>
          </button>
        </div>

        <div class="modal-body">${this.state.wallets.map(s=>this.walletDom(s))}</div>

        ${this.footer}
      </div>
    </div>`}};return ce.NearWalletsPopup=o,ce}var je={},bt;function kn(){if(bt)return je;bt=1,Object.defineProperty(je,"__esModule",{value:!0});class t{dbName;storeName;version;constructor(n,l){this.dbName=n,this.storeName=l,this.version=1}getDb(){return new Promise((n,l)=>{if(typeof window>"u"||typeof indexedDB>"u"){l(new Error("IndexedDB is not available (SSR environment)"));return}const o=indexedDB.open(this.dbName,this.version);o.onerror=a=>{console.error("Error opening database:",a.target.error),l(new Error("Error opening database"))},o.onsuccess=a=>{n(o.result)},o.onupgradeneeded=a=>{const s=o.result;s.objectStoreNames.contains(this.storeName)||s.createObjectStore(this.storeName)}})}async getItem(n){const l=await this.getDb();if(typeof n=="number"&&(n=n.toString()),typeof n!="string")throw new Error("Key must be a string");return new Promise((o,a)=>{if(!this.storeName){a(new Error("Store name not set"));return}const s=l.transaction(this.storeName,"readonly");s.onerror=u=>a(s.error);const d=s.objectStore(this.storeName).get(n);d.onerror=u=>a(d.error),d.onsuccess=()=>{o(d.result),l.close()}})}async setItem(n,l){const o=await this.getDb();if(typeof n=="number"&&(n=n.toString()),typeof n!="string")throw new Error("Key must be a string");return new Promise((a,s)=>{if(!this.storeName){s(new Error("Store name not set"));return}const i=o.transaction(this.storeName,"readwrite");i.onerror=f=>s(i.error);const u=i.objectStore(this.storeName).put(l,n);u.onerror=f=>s(u.error),u.onsuccess=()=>{o.close(),a()}})}async removeItem(n){const l=await this.getDb();if(typeof n=="number"&&(n=n.toString()),typeof n!="string")throw new Error("Key must be a string");return new Promise((o,a)=>{if(!this.storeName){a(new Error("Store name not set"));return}const s=l.transaction(this.storeName,"readwrite");s.onerror=u=>a(s.error);const d=s.objectStore(this.storeName).delete(n);d.onerror=u=>a(d.error),d.onsuccess=()=>{l.close(),o()}})}async keys(){const n=await this.getDb();return new Promise((l,o)=>{if(!this.storeName){o(new Error("Store name not set"));return}const a=n.transaction(this.storeName,"readonly");a.onerror=d=>o(a.error);const i=a.objectStore(this.storeName).getAllKeys();i.onerror=d=>o(i.error),i.onsuccess=()=>{l(i.result),n.close()}})}async count(){const n=await this.getDb();return new Promise((l,o)=>{if(!this.storeName){o(new Error("Store name not set"));return}const a=n.transaction(this.storeName,"readonly");a.onerror=d=>o(a.error);const i=a.objectStore(this.storeName).count();i.onerror=d=>o(i.error),i.onsuccess=()=>{l(i.result),n.close()}})}async length(){return this.count()}async clear(){const n=await this.getDb();return new Promise((l,o)=>{if(!this.storeName){o(new Error("Store name not set"));return}const a=n.transaction(this.storeName,"readwrite");a.onerror=d=>o(a.error);const i=a.objectStore(this.storeName).clear();i.onerror=d=>o(i.error),i.onsuccess=()=>{n.close(),l()}})}}return je.default=t,je}var jt;function Nn(){if(jt)return B;jt=1;var t=B&&B.__importDefault||function(m){return m&&m.__esModule?m:{default:m}};Object.defineProperty(B,"__esModule",{value:!0}),B.NearConnector=void 0;const r=Mt(),n=vn(),l=It(),o=t(kn()),a=Pt(),s=Lt(),i=Wt(),d=["https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json","https://cdn.jsdelivr.net/gh/azbang/hot-connector/repository/manifest.json"];function u(m){return h=>Object.entries(m).length===0?!0:Object.entries(m).filter(([c,g])=>g===!0).every(([c])=>h.manifest.features?.[c]===!0)}let f=class{storage;events;db;logger;wallets=[];manifest={wallets:[],version:"1.0.0"};features={};network="mainnet";providers={mainnet:[],testnet:[]};walletConnect;footerBranding;excludedWallets=[];autoConnect;cspNonce;whenManifestLoaded;constructor(h){this.db=new o.default("hot-connector","wallets"),this.storage=h?.storage??new l.LocalStorage,this.events=h?.events??new r.EventEmitter,this.logger=h?.logger,this.cspNonce=h?.cspNonce,this.network=h?.network??"mainnet",this.walletConnect=h?.walletConnect,this.autoConnect=h?.autoConnect??!0,this.providers=h?.providers??{mainnet:[],testnet:[]},this.excludedWallets=h?.excludedWallets??[],this.features=h?.features??{},h?.footerBranding!==void 0?this.footerBranding=h?.footerBranding:this.footerBranding={icon:"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%20512%20512%22%20class%3D%22size-7%22%3E%3Crect%20width%3D%22512%22%20height%3D%22512%22%20fill%3D%22%2300ec97%22%20rx%3D%22110%22%2F%3E%3Cpath%20fill%3D%22%23000%22%20d%3D%22M373.89%20106.199a31.95%2031.95%200%200%200-27.213%2015.207l-62.631%2092.979a6.67%206.67%200%200%200-.989%205.001%206.66%206.66%200%200%200%202.837%204.235%206.67%206.67%200%200%200%208.032-.494l61.643-53.47c1.02-.924%202.599-.827%203.523.193.419.473.644%201.074.644%201.697v167.402a2.49%202.49%200%200%201-2.502%202.491%202.48%202.48%200%200%201-1.912-.891L168.976%20117.497a31.93%2031.93%200%200%200-24.356-11.298h-6.508c-17.623%200-31.917%2014.294-31.917%2031.917v235.767c0%2017.623%2014.294%2031.917%2031.917%2031.917a31.94%2031.94%200%200%200%2027.213-15.206l62.631-92.98a6.66%206.66%200%200%200-1.847-9.236%206.67%206.67%200%200%200-8.033.494l-61.643%2053.471c-1.02.923-2.599.826-3.522-.194a2.5%202.5%200%200%201-.634-1.697V173.008a2.49%202.49%200%200%201%202.502-2.492c.731%200%201.439.322%201.912.891l186.313%20223.096a31.95%2031.95%200%200%200%2024.357%2011.297h6.508c17.623%200%2031.927-14.272%2031.938-31.895V138.116c0-17.623-14.294-31.917-31.917-31.917%22%2F%3E%3C%2Fsvg%3E",heading:"NEAR Connector",link:"https://wallet.near.org",linkText:"Don't have a wallet?"},this.whenManifestLoaded=new Promise(async c=>{h?.manifest==null||typeof h.manifest=="string"?this.manifest=await this._loadManifest(h?.manifest).catch(()=>({wallets:[],version:"1.0.0"})):this.manifest=h?.manifest??{wallets:[],version:"1.0.0"};const g=new Set(this.excludedWallets);g.delete("hot-wallet"),this.manifest.wallets=this.manifest.wallets.filter(p=>!(p.permissions.walletConnect&&!this.walletConnect||g.has(p.id))),await new Promise(p=>setTimeout(p,100)),c()}),typeof window<"u"&&(window.addEventListener("near-wallet-injected",this._handleNearWalletInjected),window.dispatchEvent(new Event("near-selector-ready")),window.addEventListener("message",async c=>{c.data.type==="near-wallet-injected"&&(await this.whenManifestLoaded.catch(()=>{}),this.wallets=this.wallets.filter(g=>g.manifest.id!==c.data.manifest.id),this.wallets.unshift(new a.ParentFrameWallet(this,c.data.manifest)),this.events.emit("selector:walletsChanged",{}),this.autoConnect&&this.connect({walletId:c.data.manifest.id}))})),this.whenManifestLoaded.then(()=>{typeof window<"u"&&window.parent.postMessage({type:"near-selector-ready"},"*"),this.manifest.wallets.forEach(c=>this.registerWallet(c)),this.storage.get("debug-wallets").then(c=>{JSON.parse(c??"[]").forEach(p=>this.registerDebugWallet(p))})})}get availableWallets(){return this.wallets.filter(c=>Object.entries(this.features).every(([g,p])=>!(p&&!c.manifest.features?.[g]))).filter(c=>!(this.network==="testnet"&&!c.manifest.features?.testnet))}_handleNearWalletInjected=h=>{this.wallets=this.wallets.filter(c=>c.manifest.id!==h.detail.manifest.id),this.wallets.unshift(new s.InjectedWallet(this,h.detail)),this.events.emit("selector:walletsChanged",{})};async _loadManifest(h){const c=h?[h]:d;for(const g of c){const p=await fetch(g).catch(()=>null);if(!(!p||!p.ok))return await p.json()}throw new Error("Failed to load manifest")}async switchNetwork(h,c){this.network!==h&&(await this.disconnect().catch(()=>{}),this.network=h,await this.connect(c))}async registerWallet(h){if(h.type!=="sandbox")throw new Error("Only sandbox wallets are supported");this.wallets.find(c=>c.manifest.id===h.id)||(this.wallets.push(new i.SandboxWallet(this,h)),this.events.emit("selector:walletsChanged",{}))}async registerDebugWallet(h){const c=typeof h=="string"?JSON.parse(h):h;if(c.type!=="sandbox")throw new Error("Only sandbox wallets type are supported");if(!c.id)throw new Error("Manifest must have an id");if(!c.name)throw new Error("Manifest must have a name");if(!c.icon)throw new Error("Manifest must have an icon");if(!c.website)throw new Error("Manifest must have a website");if(!c.version)throw new Error("Manifest must have a version");if(!c.executor)throw new Error("Manifest must have an executor");if(!c.features)throw new Error("Manifest must have features");if(!c.permissions)throw new Error("Manifest must have permissions");if(this.wallets.find(p=>p.manifest.id===c.id))throw new Error("Wallet already registered");c.debug=!0,this.wallets.unshift(new i.SandboxWallet(this,c)),this.events.emit("selector:walletsChanged",{});const g=this.wallets.filter(p=>p.manifest.debug).map(p=>p.manifest);return this.storage.set("debug-wallets",JSON.stringify(g)),c}async removeDebugWallet(h){this.wallets=this.wallets.filter(g=>g.manifest.id!==h);const c=this.wallets.filter(g=>g.manifest.debug).map(g=>g.manifest);this.storage.set("debug-wallets",JSON.stringify(c)),this.events.emit("selector:walletsChanged",{})}async selectWallet({features:h={}}={}){return await this.whenManifestLoaded.catch(()=>{}),new Promise((c,g)=>{const p=new n.NearWalletsPopup({footer:this.footerBranding,wallets:this.availableWallets.filter(u(h)).map(x=>x.manifest),onRemoveDebugManifest:async x=>this.removeDebugWallet(x),onAddDebugManifest:async x=>this.registerDebugWallet(x),onReject:()=>(g(new Error("User rejected")),p.destroy()),onSelect:x=>(c(x),p.destroy())});p.create()})}async connect(h={}){let c=h.walletId;const g=h.signMessageParams;await this.whenManifestLoaded.catch(()=>{}),c||(c=await this.selectWallet({features:{signInAndSignMessage:h.signMessageParams!=null?!0:void 0,signInWithFunctionCallKey:h.addFunctionCallKey!=null?!0:void 0}}));try{const p=await this.wallet(c);this.logger?.log("Wallet available to connect",p),await this.storage.set("selected-wallet",c),this.logger?.log(`Set preferred wallet, try to signIn${g!=null?" (with signed message)":""}`,c);let x;if(h.addFunctionCallKey!=null&&(this.logger?.log("Adding function call access key during sign in with params",h.addFunctionCallKey),x={...h.addFunctionCallKey,gasAllowance:h.addFunctionCallKey.gasAllowance??{amount:"250000000000000000000000",kind:"limited"}}),g!=null){const j=await p.signInAndSignMessage({addFunctionCallKey:x,messageParams:g,network:this.network});if(!j?.length)throw new Error("Failed to sign in");this.logger?.log("Signed in to wallet (with signed message)",c,j),this.events.emit("wallet:signInAndSignMessage",{wallet:p,accounts:j,success:!0}),this.events.emit("wallet:signIn",{wallet:p,accounts:j.map(w=>({accountId:w.accountId,publicKey:w.publicKey})),success:!0,source:"signInAndSignMessage"})}else{const j=await p.signIn({addFunctionCallKey:x,network:this.network});if(!j?.length)throw new Error("Failed to sign in");this.logger?.log("Signed in to wallet",c,j),this.events.emit("wallet:signIn",{wallet:p,accounts:j,success:!0,source:"signIn"})}return p}catch(p){throw this.logger?.log("Failed to connect to wallet",p),p}}async disconnect(h){h||(h=await this.wallet()),await h.signOut({network:this.network}),await this.storage.remove("selected-wallet"),this.events.emit("wallet:signOut",{success:!0})}async getConnectedWallet(){await this.whenManifestLoaded.catch(()=>{});const h=await this.storage.get("selected-wallet"),c=this.wallets.find(p=>p.manifest.id===h);if(!c)throw new Error("No wallet selected");const g=await c.getAccounts();if(!g?.length)throw new Error("No accounts found");return{wallet:c,accounts:g}}async wallet(h){if(await this.whenManifestLoaded.catch(()=>{}),!h)return this.getConnectedWallet().then(({wallet:g})=>g).catch(async()=>{throw await this.storage.remove("selected-wallet"),new Error("No accounts found")});const c=this.wallets.find(g=>g.manifest.id===h);if(!c)throw new Error("Wallet not found");return c}async use(h){await this.whenManifestLoaded.catch(()=>{}),this.wallets=this.wallets.map(c=>new Proxy(c,{get(g,p,x){const j=Reflect.get(g,p,x);if(p in h&&typeof j=="function"){const w=h[p];return function(...k){const _=()=>j.apply(g,k);return k.length>0?w.call(this,...k,_):w.call(this,void 0,_)}}return j}}))}on(h,c){this.events.on(h,c)}once(h,c){this.events.once(h,c)}off(h,c){this.events.off(h,c)}removeAllListeners(h){this.events.removeAllListeners(h)}};return B.NearConnector=f,B}var vt;function Sn(){return vt||(vt=1,(function(t){Object.defineProperty(t,"__esModule",{value:!0}),t.assertGasKeyActionsSupported=t.isGasKeyAction=t.nearActionsToConnectorActions=t.NearConnector=t.InjectedWallet=t.SandboxWallet=t.ParentFrameWallet=t.LocalStorage=void 0;var r=It();Object.defineProperty(t,"LocalStorage",{enumerable:!0,get:function(){return r.LocalStorage}});var n=Pt();Object.defineProperty(t,"ParentFrameWallet",{enumerable:!0,get:function(){return n.ParentFrameWallet}});var l=Wt();Object.defineProperty(t,"SandboxWallet",{enumerable:!0,get:function(){return l.SandboxWallet}});var o=Lt();Object.defineProperty(t,"InjectedWallet",{enumerable:!0,get:function(){return o.InjectedWallet}});var a=Nn();Object.defineProperty(t,"NearConnector",{enumerable:!0,get:function(){return a.NearConnector}});var s=$e();Object.defineProperty(t,"nearActionsToConnectorActions",{enumerable:!0,get:function(){return s.nearActionsToConnectorActions}});var i=Ee();Object.defineProperty(t,"isGasKeyAction",{enumerable:!0,get:function(){return i.isGasKeyAction}}),Object.defineProperty(t,"assertGasKeyActionsSupported",{enumerable:!0,get:function(){return i.assertGasKeyActionsSupported}})})(We)),We}var An=Sn();const Cn=t=>{const r=new TextEncoder().encode(t);let n="";for(const l of r)n+=String.fromCharCode(l);return btoa(n)};let Oe=0;const $n=6;let Ne=0;const Ot=[],En=()=>Ne<$n?(Ne++,Promise.resolve()):new Promise(t=>Ot.push(()=>(Ne++,t()))),_n=()=>{Ne--,Ot.shift()?.()};async function C(t,r,n={}){const l=JSON.stringify({jsonrpc:"2.0",id:1,method:"query",params:{request_type:"call_function",finality:"optimistic",account_id:t,method_name:r,args_base64:Cn(JSON.stringify(n))}});let o,a;await En();try{for(let i=0;i<6;i++){const d=Re[(Oe+i)%Re.length];try{const u=new AbortController,f=setTimeout(()=>u.abort(),8e3),m=await fetch(d,{method:"POST",headers:{"content-type":"application/json"},body:l,signal:u.signal}).finally(()=>clearTimeout(f));if(m.status===429||m.status>=500)throw new Error(`RPC answered ${m.status}`);o=await m.json(),Oe=(Oe+i)%Re.length;break}catch(u){a=u,await new Promise(f=>setTimeout(f,250*2**i))}}}finally{_n()}if(!o)throw new Error(`Could not reach NEAR ${Ue} (${a instanceof Error?a.message:"network error"}). Retrying…`);const s=o.error?.data??o.error?.message??o.result?.error;if(s)throw new Error(typeof s=="string"?s:JSON.stringify(s));return JSON.parse(new TextDecoder().decode(new Uint8Array(o.result.result)))}const P=new An.NearConnector({network:Ue,features:{testnet:!0}});function In(){const[t,r]=b.useState(null);return b.useEffect(()=>{P.getConnectedWallet().then(o=>r(o.accounts[0]?.accountId??null)).catch(()=>r(null));const n=o=>r(o.accounts[0]?.accountId??null),l=()=>r(null);return P.on("wallet:signIn",n),P.on("wallet:signOut",l),()=>{P.off("wallet:signIn",n),P.off("wallet:signOut",l)}},[]),t}const he=1000000000000n;async function G(t,r,n,l={}){return(await P.wallet()).signAndSendTransaction({receiverId:t,actions:[{type:"FunctionCall",params:{methodName:r,args:n,gas:(l.gas??30n*he).toString(),deposit:(l.deposit??0n).toString()}}]})}function Ft(t){const r=t instanceof Error?t.message:typeof t=="string"?t:JSON.stringify(t),n=r.match(/Smart contract panicked: ([^"\\}]+)/);return n?n[1]:/reject|cancel|denied|closed/i.test(r)?"Cancelled in the wallet.":r.length>220?r.slice(0,220)+"…":r}const Pn='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#1c1c1c"/><g stroke="#fff" stroke-width="3" stroke-linejoin="round"><path d="M24 62 18 34l13 13 7-21 10 19 10-19 7 21 13-13-6 28z" fill="#f8d23c"/><path d="M22 62h52v9H22z" fill="#f3b72c"/></g><circle cx="48" cy="54" r="3.4" fill="#45b4ea"/></svg>',qt="data:image/svg+xml;utf8,"+encodeURIComponent(Pn),Bt=t=>t===qt;function me(t,r,n=6e3){const[l,o]=b.useState(null),[a,s]=b.useState(null),i=b.useRef(t);i.current=t;const d=b.useCallback(async()=>{try{o(await i.current()),s(null)}catch(u){s(Ft(u))}},[]);return b.useEffect(()=>{o(null),d();const u=setInterval(d,n);return()=>clearInterval(u)},r),{data:l,error:a,refresh:d}}function Ye(){const[t,r]=b.useState(Date.now());return b.useEffect(()=>{const n=setInterval(()=>r(Date.now()),1e3);return()=>clearInterval(n)},[]),t}let Dt=()=>{};const kt=(t,r)=>Dt({kind:t,text:r});function Nt(){const[t,r]=b.useState([]);return b.useEffect(()=>{Dt=n=>{const l=Date.now()+Math.random();r(o=>[...o,{...n,id:l}]),setTimeout(()=>r(o=>o.filter(a=>a.id!==l)),n.kind==="err"?9e3:4500)}},[]),e.jsx("div",{className:"toasts",role:"status","aria-live":"polite",children:t.map(n=>e.jsx("div",{className:`toast ${n.kind}`,children:n.text},n.id))})}function _e(t){const[r,n]=b.useState(null);return{busy:r,run:async(o,a,s,i=!1)=>{if(!r){n(o);try{await s(),kt("ok",a),i&&en(),t?.()}catch(d){kt("err",Ft(d))}finally{n(null)}}}}}async function ue(t){if(t)return!0;try{await P.connect()}catch{}return!1}const Fe=new Map;function Kt(t){const r=Fe.get(t);if(r)return r;const n=C(t,"ft_metadata").then(l=>l.icon);return Fe.set(t,n),n.catch(()=>Fe.delete(t)),n}const Ut=b.createContext(null),Ht=()=>b.useContext(Ut);function Tn({size:t}){return e.jsx("span",{className:"crown",style:{width:t,height:t*330/400},"aria-hidden":!0,children:e.jsx(Be,{})})}function Ve({token:t,icon:r,symbol:n,size:l=56,crown:o}){const[a,s]=b.useState(r??null);b.useEffect(()=>{if(r!==void 0)return s(r);if(!t)return;let u=!0,f=0;const m=()=>Kt(t).then(h=>u&&s(h)).catch(()=>{u&&++f<5&&setTimeout(m,1500*f)});return m(),()=>{u=!1}},[t,r]);const i={width:l,height:l,fontSize:l*.36},d=a?e.jsx("img",{className:"coin",src:a,alt:"",style:i,title:Bt(a)?"No image uploaded: default crown":void 0}):e.jsx("span",{className:"coin placeholder",style:i,"aria-hidden":!0,children:n.slice(0,2)});return o?e.jsxs("span",{className:"crowned",title:"Champion",children:[d,e.jsx(Tn,{size:l*.82})]}):d}function Mn({token:t}){const[r,n]=b.useState(!1);return b.useEffect(()=>{let l=!0;return Kt(t).then(o=>l&&n(Bt(o))).catch(()=>{}),()=>{l=!1}},[t]),r?e.jsx("span",{className:"pchip noimg",title:"The creator uploaded no image, so this coin shows the default crown",children:"No image"}):null}async function zt(t){const r=await Promise.all(t.entrants.map(l=>C(l.token,"get_info"))),n=r.length?Number(BigInt(r[0].now_ns)/1000000n):Date.now();return{t,info:r,skew:n-Date.now()}}const fe=(t,r)=>Number(BigInt(t.t.round_end_ns)/1000000n)-(r+t.skew),Ae=t=>t.entrants.map((r,n)=>n).filter(r=>t.entrants[r].eliminated_in===null);function Je(t){return t.t.phase!=="Playing"?[]:Ae(t.t).filter(r=>t.info[r].status==="Live"&&t.info[r].rival!==null)}function Ie(t,r){if(r===0)return"Registration";const n=t.rounds[r-1]?.reduce((l,o)=>l+(o.b===null?1:2),0)??0;return n<=2?"Final":n<=4?"Semi-final":n<=8?"Quarter-final":`Round ${r}`}function Rn(t,r){let n=Number(BigInt(t)),l=Number(BigInt(r));const o=Math.min(n,l,0);return n-=o,l-=o,n+l===0?50:n/(n+l)*100}function Wn({a:t,b:r,label:n}){const l=Rn(t,r);return e.jsxs("div",{className:"scorebar",role:"img","aria-label":n,children:[e.jsx("div",{className:"fill a",style:{width:`${l}%`}}),e.jsx("div",{className:"fill b",style:{width:`${100-l}%`}})]})}function qe({children:t}){const r=b.useRef(null),[n,l]=b.useState(typeof IntersectionObserver>"u");return b.useEffect(()=>{const o=r.current;if(!o||n)return;const a=new IntersectionObserver(s=>{s.some(i=>i.isIntersecting)&&(l(!0),a.disconnect())},{rootMargin:"0px 0px -8% 0px"});return a.observe(o),()=>a.disconnect()},[n]),e.jsx("div",{ref:r,className:`reveal ${n?"in":""}`,children:t})}const Ln=typeof window<"u"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,D=["#2f9e62","#1f7ae0","#7a4fd6","#c2452f"],ve=9;function On(){const t=[{d:"M40 45 H125 V80 H210",from:1.3,to:2.5},{d:"M40 115 H125 V80 H210",from:1.3,to:2.5},{d:"M40 185 H125 V220 H210",from:1.3,to:2.5},{d:"M40 255 H125 V220 H210",from:1.3,to:2.5},{d:"M210 80 H295 V150 H380",from:3.7,to:4.9},{d:"M210 220 H295 V150 H380",from:3.7,to:4.9}],r=(n,l,o,a,s)=>e.jsxs("g",{className:`node ${s}`,style:{transformOrigin:`${n}px ${l}px`},children:[e.jsx("circle",{cx:n,cy:l,r:o,fill:a}),e.jsx("text",{x:n,y:l+1,fontSize:o*1.05,textAnchor:"middle",dominantBaseline:"central",children:"🐸"})]});return e.jsxs("svg",{className:"herobracket",viewBox:"0 0 430 300",role:"img","aria-label":"Four copies of one ticker are paired off; each loser's liquidity flows into its winner until one coin is left",children:[t.map((n,l)=>e.jsx("path",{className:"wire",d:n.d},l)),!Ln&&t.flatMap((n,l)=>[0,.18,.36].map(o=>{const a=(n.from+o)/ve,s=(n.to+o)/ve;return e.jsxs("circle",{r:"4.5",className:"drop",children:[e.jsx("animateMotion",{dur:`${ve}s`,repeatCount:"indefinite",path:n.d,calcMode:"linear",keyPoints:"0;0;1;1",keyTimes:`0;${a};${s};1`}),e.jsx("animate",{attributeName:"opacity",dur:`${ve}s`,repeatCount:"indefinite",values:"0;0;1;1;0;0",keyTimes:`0;${a};${a+.01};${s-.01};${s};1`})]},`${l}-${o}`)})),r(40,45,22,D[0],"l1 loses1"),r(40,115,22,D[1],"l1"),r(40,185,22,D[2],"l1 loses1"),r(40,255,22,D[3],"l1"),r(210,80,28,D[1],"l2 loses2"),r(210,220,28,D[3],"l2"),e.jsx("circle",{className:"halo",cx:"380",cy:"150",r:"44"}),r(380,150,36,D[3],"l3"),e.jsxs("g",{className:"svgcrown",children:[e.jsx("path",{d:"M353 112 L356 90 L370 104 L380 84 L390 104 L404 90 L407 112 Z",fill:"#ffd23f",stroke:"#7a5c00",strokeWidth:"2.5",strokeLinejoin:"round"}),e.jsx("rect",{x:"352",y:"110",width:"56",height:"8",rx:"2.5",fill:"#f2b705",stroke:"#7a5c00",strokeWidth:"2.5"}),e.jsx("circle",{cx:"367",cy:"114",r:"2.4",fill:"#f0473c"}),e.jsx("circle",{cx:"380",cy:"114",r:"2.4",fill:"#45c486"}),e.jsx("circle",{cx:"393",cy:"114",r:"2.4",fill:"#f0473c"})]})]})}function Gt({p:t,r}){return e.jsxs(e.Fragment,{children:["It depends on who you are. ",e.jsx("b",{children:"If you launched the original"}),", the bracket is a shield: once your coin is champion, every later copy of the ticker has to beat you first, and if it loses, its liquidity and holders move into your coin, with ",r,"% of what it brings paid to you as creator. Copies feed you instead of splitting your buyers. ",e.jsx("b",{children:"If you hold a copy that loses"}),", about ",100-t,"% of its liquidity comes back to you as the winner's tokens. ",e.jsx("b",{children:"If you trade"}),", the ticker ends with one deep pool instead of a guessing game.",e.jsx("span",{className:"fine",children:"Selling right after a conversion is taxed while the post-win sell tax fades. Elsewhere a copy that loses the crowd stays a separate, thinning pool; we do not claim its holders lose everything. Only coins launched here are in a bracket."})]})}function Fn({config:t}){const r=t?t.penalty_bps/100:15,n=t?.creator_reward_bps!==void 0?t.creator_reward_bps/100:1,l=t?.score_cap?`${v(t.score_cap)} NEAR`:"a fixed amount of NEAR",o=[["Why would anyone launch a copy here, if it can lose?",e.jsx(Gt,{p:r,r:n}),!0],["What problem does this solve?",e.jsx(e.Fragment,{children:"When something goes viral it gets launched many times with the same ticker, and the copies split the same buyers. Here, copies launched with the same ticker are forced into one bracket, and the bracket merges their liquidity into a single coin."})],["What happens to my coin if it loses?",e.jsxs(e.Fragment,{children:["Its whole reserve moves to the winner. ",r,"% is the penalty: ",n,"% of it goes to the winning coin's creator and the rest stays in the winner's curve with no new tokens (the winners' spoils). The other ",100-r,'% buys winner tokens, and you claim your share by burning your dead coin with the "Convert my bag" button. If that winner later loses too, you convert again.']})],["How is the winner of a round decided?",e.jsxs(e.Fragment,{children:["By score: the NEAR that came into the coin's curve since the round started, multiplied by how long it stayed. Liquidity the coin already had scores nothing, a buy in the last minutes scores little, and each wallet counts for at most ",l," per round. The two token contracts compare scores themselves."]})],["Why is there a sell tax?",e.jsxs(e.Fragment,{children:["Without it, holders of the coin that is about to lose would sell just before the bell and skip the penalty. The tax ramps from 0% to ",r,"% over the round, so leaving at the bell costs the same as losing. After a win it restarts at ",r,"% and fades",t?` over ${L(t.cooldown_ns)}`:"",", so winners cannot dump on the holders who were just converted in. The tax never leaves the coin's curve."]})],["Can the team change the rules or take the money?",e.jsx(e.Fragment,{children:"No. Neither contract has an owner or an admin method. The arena account has no access keys, so its code cannot be replaced, and every coin runs the same token code pinned by hash. The numbers on the Rules page are read from the contract."})],["What does it cost to launch?",e.jsxs(e.Fragment,{children:[t?`${v(t.launch_fee)} NEAR`:"A small"," fee for the coin's account, plus a seed of at least ",t?`${v(t.min_seed,3)} NEAR`:"the minimum",". The seed is not a fee: it buys your first tokens from your own coin's curve."]})],["I launched late and the ticker is locked. Now what?",e.jsx(e.Fragment,{children:"Wait for the bracket to finish. Launching the ticker after that opens a new season, and the reigning champion is automatically entered in it, so you face it directly."})],["Does it cover copies launched on other launchpads?",e.jsx(e.Fragment,{children:"No. A contract can only move liquidity it holds, so only coins launched here are in the bracket. The DexScreener and meme.cooking numbers on this page show how common the problem is; they are not coins we can merge."})],["Can one wallet carry a coin through a round?",e.jsxs(e.Fragment,{children:["Not alone: each wallet's net inflow counts for at most ",l," per round, however much it buys. Someone can split money across several wallets to get around the cap; each wallet then pays for its own token storage and fees. The cap limits a whale, it does not turn the score into one person, one vote."]})],["Can someone stuff a bracket with empty copies?",e.jsx(e.Fragment,{children:"One account can launch one coin per bracket, so stuffing takes one funded wallet per copy. Every copy also brings its seed, and when it loses, that seed flows into the coin that beat it. Stuffing a bracket mostly pays your rivals."})],["Could another launchpad use this?",e.jsx(e.Fragment,{children:"In principle: the arena is just a contract, so a launchpad such as meme.cooking could route same-ticker launches into a bracket. That is an idea, not an agreement. Nobody has agreed to it."})],["What can still go wrong?",e.jsx(e.Fragment,{children:"A group of wallets can still pool money to carry a coin. A bracket's slots can be filled by copies from different wallets. The sell tax discourages running but cannot stop it. The contracts are hackathon code and have not been audited. The Rules page lists every known limit."})]];return e.jsx("section",{className:"faq",id:"faq",children:o.map(([a,s,i])=>e.jsxs("details",{className:i?"hl":"",open:i,children:[e.jsxs("summary",{children:[i&&e.jsx("span",{className:"faqtag",children:"Asked most"}),a]}),e.jsx("p",{children:s})]},a))})}function qn(){const{data:t}=me(()=>C(E,"get_config"),[],6e4),r=t?t.penalty_bps/100:15,n=t?.creator_reward_bps!==void 0?t.creator_reward_bps/100:1,l=o=>window.location.hash=`#/launch/${o}`;return b.useEffect(()=>{window.location.hash==="#/faq"&&setTimeout(()=>document.getElementById("faq")?.scrollIntoView({behavior:"smooth"}),300)},[]),e.jsxs("div",{className:"landing",children:[e.jsxs("section",{className:"hero3",children:[e.jsxs("div",{className:"herolabels",children:[e.jsx("span",{children:"(Memecoin launchpad)"}),e.jsx("span",{children:"One ticker. One survivor."}),e.jsxs("span",{className:"livelabel",children:[e.jsx("i",{})," Live on NEAR ",Ue]})]}),e.jsx("div",{className:"herocrown",children:e.jsx(Be,{draw:!0,title:"A crown, drawn line by line"})}),e.jsxs("div",{className:"herobottom",children:[e.jsxs("h1",{className:"heroname","aria-label":"Heavy Is The Crown",children:[e.jsx("span",{className:"rise",children:"Heavy Is"}),e.jsx("span",{className:"rise d1",children:"The Crown"})]}),e.jsxs("div",{className:"heroside",children:[e.jsx("p",{children:"Every copy of a memecoin lands in the same bracket. Round by round, the weaker copy's liquidity moves into the stronger one. The last coin wears the crown, and has to defend it."}),e.jsxs("div",{className:"ctas",children:[e.jsx("a",{className:"cbtn solid",href:"#/app",children:"Open app"}),e.jsx("a",{className:"cbtn",href:"#how",children:"How it works"})]})]})]})]}),e.jsxs("div",{className:"wrap",children:[e.jsxs("section",{className:"sec","data-side":"/the problem",children:[e.jsx(R,{n:"01",label:"THE PROBLEM"}),e.jsxs("p",{className:"statement",children:["When a meme goes viral, it gets launched again and again under the same ticker. ",e.jsx("span",{children:"The copies split the same buyers, and every pool ends up thin."})]}),e.jsxs("dl",{className:"bignums",children:[e.jsxs("div",{children:[e.jsxs("dt",{children:[we.shared,e.jsxs("small",{children:["/",we.promoted]})]}),e.jsx("dd",{children:"of the tokens promoted most on DexScreener share their ticker with another token"})]}),e.jsxs("div",{children:[e.jsxs("dt",{children:[we.totalTokens,e.jsx("small",{children:"+"})]}),e.jsxs("dd",{children:["token contracts found on those ",we.promoted," tickers (a lower bound)"]})]}),e.jsxs("div",{children:[e.jsx("dt",{children:tn.tickers}),e.jsx("dd",{children:"tickers on meme.cooking, on NEAR, listed by two or more different accounts"})]})]}),e.jsx(qe,{children:e.jsx(nn,{})})]}),e.jsxs("section",{className:"sec",id:"how","data-side":"/the mechanic",children:[e.jsx(R,{n:"02",label:"HOW IT WORKS",title:"how it works"}),e.jsxs("div",{className:"howgrid",children:[e.jsxs("div",{className:"howart darkzone",children:[e.jsx("span",{className:"tinylabel",children:"(One bracket per ticker)"}),e.jsx(On,{}),e.jsx("span",{className:"tinylabel",children:"Liquidity flows from each loser into its winner"})]}),e.jsxs("ol",{className:"howlist",children:[e.jsxs("li",{children:[e.jsx("i",{children:"01"}),e.jsxs("div",{children:[e.jsx("b",{children:"Register"}),e.jsx("span",{children:"The first coin of a ticker opens its bracket. Every copy launched during registration joins it."})]})]}),e.jsxs("li",{children:[e.jsx("i",{children:"02"}),e.jsxs("div",{children:[e.jsx("b",{children:"Fight"}),e.jsx("span",{children:"Copies are paired. The one that pulls in more new money, and keeps it longer, wins the round."})]})]}),e.jsxs("li",{children:[e.jsx("i",{children:"03"}),e.jsxs("div",{children:[e.jsx("b",{children:"Merge"}),e.jsx("span",{children:"The loser's liquidity and holders move into the winner. The last coin standing holds all of it."})]})]}),e.jsxs("li",{children:[e.jsx("i",{children:"04"}),e.jsxs("div",{children:[e.jsx("b",{children:"Defend"}),e.jsx("span",{children:"Launch the ticker again and a new season opens with the champion already entered. The crown has to be kept."})]})]})]})]})]}),e.jsxs("section",{className:"sec","data-side":"/why here",children:[e.jsx(R,{n:"03",label:"WHY HERE",title:"why launch a copy here, if it can lose?"}),e.jsxs("div",{className:"bento",children:[e.jsxs("div",{className:"bcard darkzone",children:[e.jsx("span",{className:"tinylabel",children:"(If you launched the original)"}),e.jsx("strong",{children:"A shield"}),e.jsx("p",{children:"Later copies must beat you first, and feed your coin when they lose."})]}),e.jsxs("div",{className:"bcard",children:[e.jsx("span",{className:"tinylabel",children:"(If your copy loses)"}),e.jsxs("strong",{children:["≈",100-r,"% back"]}),e.jsx("p",{children:"of a losing copy's liquidity goes to its holders, as the winner's tokens."})]}),e.jsxs("div",{className:"bcard gold",children:[e.jsx("span",{className:"tinylabel",children:"(If your coin wins)"}),e.jsxs("strong",{children:[n,"% reward"]}),e.jsx("p",{children:"to the creator of the winning coin, from every coin it absorbs."})]})]}),e.jsx("p",{className:"whytext",children:e.jsx(Gt,{p:r,r:n})})]}),e.jsxs("section",{className:"sec","data-side":"/the numbers",children:[e.jsx(R,{n:"04",label:"THE NUMBERS",title:"how common it is",children:e.jsx("p",{className:"secsub",children:"Every figure links to its source. Click a dot to open that token, or the count to open the search that returned it."})}),e.jsxs(qe,{children:[e.jsx("h3",{className:"subhead",children:"Across chains, on DexScreener"}),e.jsx(sn,{pick:l})]}),e.jsxs(qe,{children:[e.jsx("h3",{className:"subhead",children:"On NEAR, on meme.cooking"}),e.jsx(rn,{pick:l})]})]}),e.jsxs("section",{className:"sec","data-side":"/questions",children:[e.jsx(R,{n:"05",label:"FAQ",title:"questions"}),e.jsx(Fn,{config:t??null})]})]}),e.jsxs("footer",{className:"endzone darkzone",children:[e.jsxs("div",{className:"secrule",children:[e.jsx("span",{children:"06"}),e.jsx("i",{}),e.jsx("span",{children:"/YOUR MOVE"})]}),e.jsxs("h2",{className:"endname",children:["Launch a copy.",e.jsx("br",{}),"Then beat it."]}),e.jsxs("div",{className:"endrow",children:[e.jsxs("div",{className:"ctas",children:[e.jsx("a",{className:"cbtn solid",href:"#/app",children:"Open app"}),e.jsx("a",{className:"cbtn",href:"pitch/",children:"Watch the pitch"})]}),e.jsx("p",{className:"fine",children:"NEAR testnet prototype · Contracts not audited · Only coins launched here are merged"})]}),e.jsxs("div",{className:"endmark",children:[e.jsx(Be,{}),e.jsx("span",{children:"HITC"}),e.jsx("small",{children:"Heavy Is The Crown · ©2026"})]})]})]})}async function Bn(){const t=await C(E,"tournament_count"),r=Math.max(0,t-40),n=await C(E,"get_tournaments",{from_index:r,limit:40});return Promise.all(n.reverse().map(zt))}function W(t,r){return t.t.phase==="Finished"?"finished":fe(t,r)<=0?"action":t.t.phase==="Registration"?"registering":"playing"}function Dn({s:t,now:r}){const{t:n}=t,l=fe(t,r),o=t.info.reduce((d,u)=>d+BigInt(u.reserve),0n),a=W(t,r),s=Ht(),i=!!s&&n.entrants.some(d=>d.creator===s);return e.jsxs("a",{className:`card tcard ${n.phase.toLowerCase()} ${i?"mine":""}`,href:`#/t/${n.id}`,children:[i&&e.jsx("span",{className:"minebadge",children:"Your coin is here"}),e.jsxs("div",{className:"thead",children:[e.jsxs("h3",{children:["$",n.ticker]}),n.season>1&&e.jsxs("span",{className:"season",children:["season ",n.season]}),e.jsxs("span",{className:"right",children:[v(o)," NEAR in the bracket"]})]}),e.jsx("div",{className:"faces",children:n.entrants.map((d,u)=>e.jsx("span",{className:`${d.eliminated_in!==null?"out":""} ${s===d.creator?"minecoin":""}`,title:s===d.creator?`${d.name} (yours)`:d.name,children:e.jsx(Ve,{token:d.token,symbol:n.ticker,size:40,crown:n.champion===u})},d.token))}),e.jsx("div",{className:"meta",children:a==="finished"?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"pill done",children:"COMPLETED"}),e.jsx("span",{children:n.champion!==null?`${n.entrants[n.champion].name} holds every $${n.ticker}'s liquidity`:"nobody launched"})]}):a==="action"?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"pill bell",children:"ACTION NEEDED"}),e.jsx("span",{children:Je(t).length?"time's up: matches to settle":"time's up: draw the next round"})]}):e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"pill live",children:Ie(n,n.round).toUpperCase()}),e.jsx("span",{className:"mono",children:He(l)}),e.jsx("span",{children:n.phase==="Registration"?`${n.entrants.length} registered, copies can still join`:`${Ae(n).length} of ${n.entrants.length} coins left`})]})}),e.jsxs("p",{className:"by",children:["Opened by ",n.entrants[0]?de(n.entrants[0].creator):"?"]})]})}function Kn(t,r,n){const[l,o]=b.useState(null);if(b.useEffect(()=>{if(o(null),!r||!t)return;let i=!1;return(async()=>{for(const d of t)for(const[u,f]of d.t.entrants.entries()){if(f.eliminated_in===null||d.info[u].status!=="Lost")continue;const m=BigInt(await C(f.token,"claimable",{account:r}).catch(()=>"0"));if(m>0n&&!i)return o({tid:d.t.id,name:f.name,amount:m})}})(),()=>{i=!0}},[r,t?.length]),!t)return null;if(!r)return{text:"Connect a wallet to launch a coin or back one.",cta:"Connect wallet",onClick:()=>P.connect().catch(()=>{})};if(l)return{text:`${l.name} lost its round. Convert your bag into the winner's tokens.`,cta:"Convert my bag",href:`#/t/${l.tid}`};const a=t.find(i=>W(i,n)==="action");if(a)return Je(a).length?{text:`The $${a.t.ticker} round is over. Settle it: the caller is paid from the loser's reserve.`,cta:`Settle $${a.t.ticker}`,href:`#/t/${a.t.id}`}:{text:`$${a.t.ticker} is ready for its next round. Anyone can draw it and earns a small bounty.`,cta:"Draw the next round",href:`#/t/${a.t.id}`};const s=t.find(i=>W(i,n)==="registering");return s?{text:`$${s.t.ticker} is open for copies for ${He(fe(s,n))}. Back one, or launch your own.`,cta:`Open $${s.t.ticker}`,href:`#/t/${s.t.id}`}:{text:"No bracket is waiting on you. Launch a ticker and open the next one.",cta:"Launch a coin",href:"#/launch"}}const Un=[{key:"all",label:"All"},{key:"action",label:"Action needed"},{key:"registering",label:"Registering"},{key:"playing",label:"Playing"},{key:"finished",label:"Completed"}],St={action:0,registering:1,playing:2,finished:3};function Hn({account:t}){const{data:r,error:n}=me(Bn,[],8e3),l=Ye(),[o,a]=b.useState("all"),[s,i]=b.useState(5),d=Kn(r,t,l),u=b.useMemo(()=>(r??[]).slice().sort((h,c)=>St[W(h,l)]-St[W(c,l)]||c.t.id-h.t.id),[r,l]),f=b.useMemo(()=>{const h={all:u.length};for(const c of u)h[W(c,l)]=(h[W(c,l)]??0)+1;return h},[u,l]),m=u.filter(h=>o==="all"||W(h,l)===o);return e.jsxs("div",{className:"page",children:[e.jsx(R,{n:"01",label:"BRACKETS",title:"brackets",children:e.jsx("p",{className:"secsub",children:"One bracket per ticker. Open one to back a coin, settle a finished round, or convert a losing bag."})}),d&&e.jsxs("section",{className:"next",children:[e.jsxs("div",{children:[e.jsx("p",{className:"eyebrow accent",children:"What to do next"}),e.jsx("p",{children:d.text})]}),d.href?e.jsx("a",{className:"btn",href:d.href,children:d.cta}):e.jsx("button",{className:"btn",onClick:d.onClick,children:d.cta})]}),e.jsx("div",{className:"filters",role:"tablist","aria-label":"Filter brackets",children:Un.map(h=>e.jsxs("button",{role:"tab","aria-selected":o===h.key,className:o===h.key?"on":"",onClick:()=>(a(h.key),i(5)),children:[h.label," ",e.jsx("span",{className:"count",children:f[h.key]??0})]},h.key))}),n&&!r&&e.jsxs("p",{className:"error",children:["Could not reach the arena: ",n]}),r?m.length===0?e.jsxs("div",{className:"emptystate",children:[e.jsx("p",{children:"Nothing here yet."}),e.jsx("a",{className:"btn",href:"#/launch",children:"Launch a coin"})]}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"tgrid",children:m.slice(0,s).map(h=>e.jsx(Dn,{s:h,now:l},h.t.id))}),m.length>s&&e.jsxs("button",{className:"showmore",onClick:()=>i(h=>h+5),children:["Show more ",e.jsxs("span",{children:["(",m.length-s," left)"]})]})]}):e.jsx("p",{className:"muted",children:"Loading…"})]})}const At=1000000000n,zn=4096;async function Gn(t){const r=await createImageBitmap(t),n=Math.min(r.width,r.height);for(const l of[96,80,64,48]){const o=document.createElement("canvas");o.width=o.height=l,o.getContext("2d").drawImage(r,(r.width-n)/2,(r.height-n)/2,n,n,0,0,l,l);for(const s of["image/webp","image/jpeg"])for(const i of[.82,.7,.55,.4]){const d=o.toDataURL(s,i);if(d.startsWith("data:"+s)&&d.length<=zn)return d}}throw new Error("This picture stays too large even when shrunk. Try a simpler one.")}function Ct({n:t,max:r}){return e.jsx("span",{className:`counter ${t>r?"over":""}`,children:`${t}/${r}`})}function Yn({account:t,ticker:r}){const{data:n}=me(()=>C(E,"get_config"),[],6e4),[l,o]=b.useState(1),[a,s]=b.useState(r),[i,d]=b.useState(""),[u,f]=b.useState(null),[m,h]=b.useState(null),[c,g]=b.useState(""),[p,x]=b.useState(void 0),j=b.useRef(null),w=Ye(),k=a.trim().toUpperCase(),_=/^[A-Z0-9]{2,8}$/.test(k),{busy:O,run:Y}=_e(async()=>{const N=await C(E,"get_by_ticker",{ticker:k}).catch(()=>null);N&&(window.location.hash=`#/t/${N.id}`)});if(b.useEffect(()=>s(r),[r]),b.useEffect(()=>{n&&!c&&g(v(BigInt(n.min_seed),3))},[n,c]),b.useEffect(()=>{if(x(void 0),!_)return;let N=!1;const ge=setTimeout(()=>{C(E,"get_by_ticker",{ticker:k}).then(Zt=>!N&&x(Zt)).catch(()=>!N&&x(null))},250);return()=>{N=!0,clearTimeout(ge)}},[k,_]),!n)return e.jsx("p",{className:"muted page",children:"Loading…"});const K=u??qt,F=BigInt(n.launch_fee),V=BigInt(n.min_seed),y=Et(c,24),S=n.penalty_bps/100,A=p?.phase==="Registration"&&Number(BigInt(p.round_end_ns)/1000000n)>w,U=A?Number(BigInt(p.round_end_ns)/1000000n)-w:0,Yt=!!p&&A&&p.entrants.length+p.pending_launches>=n.max_entrants,Vt=!!p&&p.phase!=="Finished"&&!A,Pe=new TextEncoder().encode(i.trim()).length;let I=null,Te="Opens a bracket";_&&p!==void 0&&(p?Vt?I={text:`$${k} is locked: its bracket is in the ${Ie(p,p.round).toLowerCase()}. Come back for the next season.`,bad:!0}:Yt?I={text:`The $${k} bracket is full (${n.max_entrants} coins).`,bad:!0}:A?(I={text:`Joins the $${k} bracket: ${p.entrants.length} of ${n.max_entrants} copies registered, ${Math.ceil(U/6e4)} min left to join.`},Te=`Joins as copy ${p.entrants.length+1}`):(I={text:`$${k} has a champion (${p.champion!==null?p.entrants[p.champion].name:"none"}). You open season ${p.season+1} and will face it.`},Te=`Season ${p.season+1} vs champion`):I={text:`Nobody has $${k} here. You open its bracket; copies have ${L(n.registration_ns)} to join.`});const q=Pe===0?"Give it a name.":Pe>32?"Name is too long.":_?I?.bad?I.text:null:"Ticker: 2 to 8 letters or digits.",pe=!y||y<V?`Seed at least ${v(V,3)} NEAR.`:null,Jt=BigInt(n.virtual_near),Me=y&&!pe?At*y/(Jt+y):null,Qt=async N=>{if(N){h(null);try{f(await Gn(N))}catch(ge){h(ge instanceof Error?ge.message:"Could not read this picture.")}}},Xt=async()=>{q||pe||!y||!await ue(t)||!await De({title:`Launch $${k}`,lines:[{label:"Leaves your wallet",value:`${v(F+y,3)} NEAR`,tone:"out"},{label:"Your seed buys",value:`≈ ${Me?.toLocaleString("en-US")} ${k}`,tone:"in"},{label:"Launch fee, not refundable",value:`${v(F)} NEAR`,tone:"lost"}],risks:[A?`Your coin enters the $${k} bracket against ${p.entrants.length} other cop${p.entrants.length===1?"y":"ies"}.`:`Every copy of $${k} launched in the next ${L(n.registration_ns)} joins your bracket.`,`If your coin loses a round, ${S}% of its liquidity goes to the winner. Its holders, you included, get the rest back as winner tokens.`,"One coin per account per bracket: this account cannot launch another copy of this ticker until the bracket ends.","NEAR testnet, contracts not audited."],confirm:"Launch"})||Y("enter",`${i.trim()} is live in the $${k} bracket.${u?"":" It was launched with no image, so it shows the default crown."}`,()=>G(E,"enter",{meme:{name:i.trim(),symbol:k,icon:K}},{deposit:F+y,gas:100n*he}),!0)};return e.jsxs("div",{className:"page launchpage",children:[e.jsx(R,{n:"02",label:"LAUNCH",title:"launch a coin",children:e.jsx("p",{className:"secsub",children:"Pick a ticker. If nobody has it here you open its bracket; if one is open, your coin joins it."})}),e.jsxs("div",{className:"launchwrap",children:[e.jsxs("section",{className:"card wizard",children:[e.jsxs("ol",{className:"stepper",children:[e.jsx("li",{className:l===1?"on":"done",children:e.jsxs("button",{onClick:()=>o(1),children:[e.jsx("i",{children:l===1?1:"✓"})," Identity"]})}),e.jsx("li",{className:l===2?"on":"",children:e.jsxs("button",{onClick:()=>!q&&o(2),disabled:!!q,children:[e.jsx("i",{children:"2"})," Seed"]})})]}),l===1?e.jsxs("div",{className:"wstep",children:[e.jsx("h2",{children:"Name it and give it a face."}),e.jsxs("div",{className:"field",children:[e.jsx("span",{className:"lbl",children:"Image"}),e.jsxs("div",{className:"imgrow",children:[e.jsx("button",{type:"button",className:"imgdrop",onClick:()=>j.current?.click(),"aria-label":"Choose an image",children:e.jsx("img",{src:K,alt:""})}),e.jsxs("div",{className:"imgside",children:[e.jsx("span",{className:"hint",children:u?"Your image, shrunk to fit on-chain (4 KB).":"Upload your own image, or launch with the default crown. Square works best; it is shrunk to fit on-chain (4 KB)."}),e.jsxs("div",{className:"row",children:[e.jsx("button",{type:"button",className:"btn ghost",onClick:()=>j.current?.click(),children:u?"Change image":"Upload image"}),u&&e.jsx("button",{type:"button",className:"btn ghost",onClick:()=>f(null),children:"Remove image"})]}),m&&e.jsx("span",{className:"where bad",children:m})]}),e.jsx("input",{ref:j,type:"file",accept:"image/*",hidden:!0,onChange:N=>Qt(N.target.files?.[0])})]}),!u&&e.jsxs("p",{className:"noimgnote",children:[e.jsx("b",{children:"No image yet."}),' Without an upload your coin launches with the default crown and is labelled "no image" in its bracket. The image cannot be changed after launch.']})]}),e.jsxs("div",{className:"pair",children:[e.jsxs("label",{className:"field",children:[e.jsx("span",{className:"lbl",children:"Name"}),e.jsx("input",{value:i,onChange:N=>d(N.target.value),placeholder:"Hot Original",maxLength:40}),e.jsx(Ct,{n:Pe,max:32})]}),e.jsxs("label",{className:"field",children:[e.jsx("span",{className:"lbl",children:"Ticker"}),e.jsx("input",{value:a,onChange:N=>s(N.target.value.replace(/\s/g,"")),placeholder:"HOT",maxLength:8,className:"mono"}),e.jsx(Ct,{n:k.length,max:8})]})]}),I&&e.jsx("p",{className:`where ${I.bad?"bad":""}`,children:I.text}),e.jsxs("div",{className:"wactions",children:[e.jsx("span",{className:"hint",children:q&&(i||a)?q:""}),e.jsx("button",{className:"btn big go",disabled:!!q,onClick:()=>o(2),children:"Continue"})]})]},"1"):e.jsxs("div",{className:"wstep",children:[e.jsx("h2",{children:"Put your money where your meme is."}),e.jsxs("label",{className:"field",children:[e.jsx("span",{className:"lbl",children:"Your seed"}),e.jsxs("div",{className:"amount",children:[e.jsx("input",{inputMode:"decimal",value:c,onChange:N=>g(N.target.value),"aria-label":"Seed in NEAR"}),e.jsx("span",{children:"NEAR"})]})]}),e.jsx("div",{className:"presets",children:[V,5n*10n**23n,10n**24n].map(N=>e.jsxs("button",{onClick:()=>g(v(N,3)),children:[v(N,3)," NEAR"]},N.toString()))}),e.jsxs("ul",{className:"facts2",children:[e.jsxs("li",{children:[e.jsx("b",{children:"The seed is not a fee."})," It buys the first tokens of your own coin, at the bottom of the curve. It is at stake like everyone else's money."]}),e.jsxs("li",{children:[e.jsx("b",{children:"A bigger seed is not a head start."})," Rounds score new money that arrives during the round, not what was there before."]})]}),e.jsxs("div",{className:"wactions",children:[e.jsx("button",{className:"btn ghost",onClick:()=>o(1),children:"Back"}),e.jsx("span",{className:"hint",children:pe??""}),e.jsx("button",{className:"btn big go",disabled:!!O||!!pe||!!q,onClick:Xt,children:O?"Waiting for wallet…":`Launch · ${y?v(F+y,3):"?"} NEAR`})]})]},"2")]}),e.jsxs("aside",{className:"boardcol",children:[e.jsx("p",{className:"lbl",children:"In the bracket"}),e.jsxs("div",{className:"card preview2",children:[e.jsxs("div",{className:"ptop",children:[e.jsx("img",{src:K,alt:""}),e.jsxs("div",{children:[e.jsx("strong",{children:i.trim()||"Your coin"}),e.jsxs("div",{className:"prow",children:[e.jsxs("span",{className:"mono",children:["$",k||"TICKER"]}),e.jsx("span",{className:"pchip",children:Te}),!u&&e.jsx("span",{className:"pchip noimg",children:"No image"})]})]})]}),e.jsxs("dl",{className:"pgrid",children:[e.jsxs("div",{children:[e.jsx("dt",{children:"Supply on the curve"}),e.jsx("dd",{children:Number(At).toLocaleString("en-US")})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Your seed buys"}),e.jsx("dd",{children:Me?`≈ ${Number(Me/1000000n).toLocaleString("en-US")}M`:"—"})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Registration"}),e.jsx("dd",{children:A?`${Math.ceil(U/6e4)} min left`:L(n.registration_ns)})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Each round"}),e.jsx("dd",{children:L(n.round_ns)})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"If it loses a round"}),e.jsxs("dd",{children:[S,"% to the winner"]})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Launch fee"}),e.jsxs("dd",{children:[v(F)," NEAR"]})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"If it wins, you earn"}),e.jsxs("dd",{children:[n.creator_reward_bps!==void 0?n.creator_reward_bps/100:0,"% of each absorbed coin"]})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Score per wallet"}),e.jsx("dd",{children:n.score_cap?`≤ ${v(n.score_cap)} NEAR / round`:"no cap"})]})]})]}),e.jsx("p",{className:"hint",children:"Name, ticker and image are stored on-chain in the token's metadata. Testnet NEAR."})]})]})]})}const Ce=2n*10n**21n,Vn=125n*10n**19n,Jn=300n;async function Qn(t,r){const n=await C(E,"get_tournament",{id:t});if(!n)throw new Error("This bracket does not exist.");const l=await zt(n);let o=null;if(r){const a=(d,u)=>Promise.all(n.entrants.map(f=>C(f.token,d,{[u]:r}).then(BigInt))),[s,i]=await Promise.all([a("ft_balance_of","account_id"),a("claimable","account")]);o={balance:s,claimable:i}}return{state:l,mine:o}}async function Xn(t,r){return(await Promise.all(r.map(l=>C(t.t.entrants[l].token,"get_trades",{from_index:Math.max(0,t.info[l].trades-30),limit:30})))).flatMap((l,o)=>l.map(a=>({...a,coin:r[o]}))).sort((l,o)=>BigInt(o.ts)>BigInt(l.ts)?1:-1).slice(0,40)}function Zn(t,r){const n=BigInt(t.virtual_near)+BigInt(t.reserve);return BigInt(t.pool_tokens)*r/(n+r)}function Ke(t,r){let l=(BigInt(t.virtual_near)+BigInt(t.reserve))*r/(BigInt(t.pool_tokens)+r);l>BigInt(t.reserve)&&(l=BigInt(t.reserve));const o=l-l*BigInt(t.sell_tax_bps)/10000n;return o>Ce?o-Ce:0n}function es(t){const r=t.toString().padStart(19,"0");return(r.slice(0,-18)+"."+r.slice(-18)).replace(/\.?0+$/,"")}function ts({info:t,token:r,balance:n,account:l,refresh:o}){const[a,s]=b.useState("buy"),[i,d]=b.useState(""),{busy:u,run:f}=_e(()=>{d(""),o()}),m=Ce+(n===0n?Vn:0n),h=Et(i,a==="buy"?24:18);let c=0n,g=null;h&&(a==="buy"?h<=m?g="Too small to cover the fee.":c=Zn(t,h-m):h>n?g=`You hold ${$(n)} ${t.symbol}.`:(c=Ke(t,h),c===0n&&(g="Too small to cover the fee.")));const p=c*(10000n-Jn)/10000n,x=t.sell_tax_bps/100,j=async()=>{if(!h||g||!await ue(l))return;const w=t.penalty_bps/100;if(a==="buy"){if(!await De({title:`Back ${t.name}`,lines:[{label:"Leaves your wallet",value:`${v(h,4)} NEAR`,tone:"out"},{label:"You receive",value:`≈ ${$(c)} ${t.symbol} (newly minted)`,tone:"in"},{label:"Fees, not refundable",value:`${v(m,5)} NEAR${m>Ce?" (includes one-time token storage)":""}`,tone:"lost"}],risks:[`If this coin loses its round, ${w}% of its liquidity goes to the winner. You keep the rest as winner tokens.`,`Selling is taxed. Right now ${x.toFixed(1)}%${t.status==="Live"?`, rising to ${w}% at the bell`:""}.`,"NEAR testnet, contracts not audited. Price can fall like any memecoin."],confirm:`Back ${t.name}`}))return;f("t",`Bought ${$(c)} ${t.name}.`,()=>G(r,"buy",{min_tokens_out:p.toString()},{deposit:h}))}else{const k=Ke({...t,sell_tax_bps:0},h);if(!await De({title:`Sell ${t.name}`,lines:[{label:"You sell",value:`${$(h)} ${t.symbol} (burned)`,tone:"out"},{label:"You receive",value:`≈ ${v(c,4)} NEAR`,tone:"in"},{label:`Sell tax ${x.toFixed(1)}%, stays in the curve`,value:`≈ ${v(k>c?k-c:0n,4)} NEAR`,tone:"lost"}],risks:["The tax is never refunded: it stays in this coin's curve for the remaining holders."],confirm:`Sell ${t.name}`}))return;f("t",`Sold ${$(h)} ${t.name}.`,()=>G(r,"sell",{amount:h.toString(),min_near_out:p.toString()},{deposit:1n}))}};return e.jsxs("div",{className:"tradebox",children:[e.jsxs("div",{className:"tabs tradetabs",role:"tablist",children:[e.jsx("button",{role:"tab","aria-selected":a==="buy",className:`buytab ${a==="buy"?"on":""}`,onClick:()=>(s("buy"),d("")),children:"Buy"}),e.jsxs("button",{role:"tab","aria-selected":a==="sell",className:`selltab ${a==="sell"?"on":""}`,onClick:()=>(s("sell"),d("")),children:["Sell ",e.jsxs("span",{className:"taxpill",title:"Sell tax right now. It stays in this coin's curve.",children:[x.toFixed(1),"% tax"]})]})]}),e.jsxs("div",{className:"amount",children:[e.jsx("input",{inputMode:"decimal",value:i,onChange:w=>d(w.target.value),placeholder:"0.0","aria-label":a==="buy"?"NEAR to spend":`${t.symbol} to sell`}),e.jsx("span",{children:a==="buy"?"NEAR":t.symbol})]}),e.jsx("div",{className:"presets",children:a==="buy"?["0.5","1","5"].map(w=>e.jsxs("button",{onClick:()=>d(w),children:[w," NEAR"]},w)):[25n,50n,100n].map(w=>e.jsxs("button",{disabled:n===0n,onClick:()=>d(es(n*w/100n)),children:[w.toString(),"%"]},w.toString()))}),e.jsx("p",{className:"quote",children:g??(h?a==="buy"?`You get ≈ ${$(c)} tokens (minted)`:`You get ≈ ${v(c,4)} NEAR after the ${x.toFixed(1)}% tax (tokens burned)`:a==="buy"?"Buying mints new supply and adds to this round's score.":"Selling burns supply. The tax stays in this coin's curve.")}),e.jsx("button",{className:`btn big ${a==="sell"?"sellbtn":"buybtn"}`,disabled:!h||!!g||!!u,onClick:j,children:u?"Waiting for wallet…":a==="buy"?`Back ${t.name}`:`Sell ${t.name}`})]})}function $t(t){const{s:r,idx:n,mine:l}=t,o=r.info[n],a=r.t.entrants[n],s=l?.balance[n]??0n,i=l?.claimable[n]??0n,d=o.status==="Live"&&fe(r,t.now)<=0,u=o.status==="Advanced"||o.status==="Live"&&!d,f=r.t.champion===n,m=o.absorbed_by?r.t.entrants.find(x=>x.token===o.absorbed_by):null,h=o.scored_inflow!==void 0?BigInt(o.scored_inflow):BigInt(o.reserve)-BigInt(o.round_base),{busy:c,run:g}=_e(t.refresh),p=async()=>{if(!await ue(t.account))return;const x=BigInt(await C(a.token,"claim_deposit"));g("claim",`Converted into ${$(i)} ${m?.name??"winner"} tokens.`,()=>G(a.token,"claim",{},{deposit:x,gas:100n*he}),!0)};return e.jsxs("section",{className:`panel ${t.side} ${o.status.toLowerCase()} ${t.account&&t.account===a.creator?"mine":""}`,children:[t.account&&t.account===a.creator&&e.jsx("span",{className:"minebadge",children:"Your coin"}),e.jsxs("header",{children:[e.jsx(Ve,{token:a.token,symbol:o.symbol,size:64,crown:f}),e.jsxs("div",{children:[e.jsx("h2",{children:o.name}),e.jsxs("a",{href:`${_t}/address/${a.token}`,target:"_blank",rel:"noreferrer",children:["$",o.symbol," · ",de(a.token)]})," ",e.jsx(Mn,{token:a.token})]}),f&&e.jsx("span",{className:"stamp won",children:"CHAMPION"}),o.status==="Lost"&&e.jsx("span",{className:"stamp lost",children:"ABSORBED"})]}),e.jsxs("dl",{className:"stats",children:[e.jsxs("div",{children:[e.jsx("dt",{children:"Round score"}),e.jsx("dd",{children:Se(o.score)})]}),e.jsxs("div",{children:[e.jsx("dt",{title:o.score_cap?`Each wallet counts for at most ${v(o.score_cap)} NEAR per round`:void 0,children:o.score_cap?"Scored inflow":"New NEAR this round"}),e.jsxs("dd",{children:[h<0n?"-":"+",v(h<0n?-h:h)]})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"NEAR in curve"}),e.jsx("dd",{children:v(o.reserve)})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Supply"}),e.jsx("dd",{children:$(o.total_supply)})]})]}),t.account&&e.jsxs("p",{className:"holding",children:["You hold ",e.jsx("b",{children:$(s)}),s>0n&&o.status!=="Lost"&&e.jsxs(e.Fragment,{children:[" · ",v(Ke(o,s),3)," NEAR if sold now"]})]}),u&&e.jsx(ts,{info:o,token:a.token,balance:s,account:t.account,refresh:t.refresh}),d&&o.rival&&e.jsx("p",{className:"muted",children:"Frozen until this match is settled."}),o.status==="Lost"&&e.jsxs("div",{className:"claim",children:[e.jsxs("p",{children:["Absorbed by ",e.jsx("b",{children:m?.name??de(o.absorbed_by??"")}),". ",o.penalty_bps/100,"% of its reserve became the winner's spoils; the rest bought winner tokens for its holders."]}),i>0n?e.jsx("button",{className:"btn big",disabled:!!c,onClick:p,children:c?"Waiting for wallet…":`Convert my bag → ${$(i)} ${m?.name??""}`}):e.jsx("p",{className:"muted",children:t.account?"You have nothing to convert here.":"Connect a wallet to see what you can convert."})]}),o.status!=="Lost"&&BigInt(o.spoils)>0n&&e.jsxs("p",{className:"spoils",children:[o.wins," win",o.wins===1?"":"s",": +",v(o.spoils)," NEAR of spoils locked into this curve with no tokens minted",o.creator_rewards&&BigInt(o.creator_rewards)>0n?`, and ${v(o.creator_rewards,3)} NEAR paid to its creator`:"","."]})]})}function ke({s:t,idx:r,sc:n,won:l,lost:o,crown:a}){if(r===null)return e.jsx("div",{className:"slot bye",children:"bye"});const s=t.t.entrants[r],i=Ht()===s.creator;return e.jsxs("div",{className:`slot ${l?"won":""} ${o?"lost":""} ${i?"mine":""}`,children:[e.jsx(Ve,{token:s.token,symbol:t.t.ticker,size:a?34:28,crown:a}),e.jsx("span",{className:"nm",children:s.name}),i&&e.jsx("span",{className:"minetag",children:"Yours"}),e.jsx("span",{className:"sc mono",children:n!==null?Se(n):""})]})}function ns({s:t,selected:r,select:n}){const{t:l}=t,o=i=>i.length===r.length&&i.every(d=>r.includes(d)),a=(i,d)=>d===l.round&&l.phase!=="Finished"?t.info[i].score:null,s=l.entrants.map((i,d)=>d);return e.jsxs("div",{className:"bracket",role:"list",children:[e.jsxs("div",{className:"bcol",role:"listitem",children:[e.jsx("h4",{children:"Registration"}),e.jsx("button",{className:`match reg ${o(s)?"sel":""}`,onClick:()=>n(s),children:l.entrants.map((i,d)=>e.jsx(ke,{s:t,idx:d,sc:l.round===0?t.info[d].score:null,won:!1,lost:!1},i.token))})]}),l.rounds.map((i,d)=>e.jsxs("div",{className:"bcol",role:"listitem",children:[e.jsx("h4",{children:Ie(l,d+1)}),e.jsx("div",{className:"bm",children:i.map((u,f)=>{const m=u.b===null?[u.a]:[u.a,u.b],h=d+1<l.round||l.phase==="Finished";return e.jsxs("button",{className:`match ${o(m)?"sel":""}`,onClick:()=>n(m),children:[e.jsx(ke,{s:t,idx:u.a,sc:u.score_a??a(u.a,d+1),won:h&&u.winner===u.a,lost:h&&u.winner!==u.a}),e.jsx(ke,{s:t,idx:u.b,sc:u.b===null?null:u.score_b??a(u.b,d+1),won:h&&u.b!==null&&u.winner===u.b,lost:h&&u.b!==null&&u.winner!==u.b})]},f)})})]},d)),l.phase==="Finished"&&l.champion!==null&&e.jsxs("div",{className:"bcol",role:"listitem",children:[e.jsx("h4",{children:"Champion"}),e.jsx("button",{className:`match ${o([l.champion])?"sel":""}`,onClick:()=>n([l.champion]),children:e.jsx(ke,{s:t,idx:l.champion,sc:null,won:!0,lost:!1,crown:!0})})]})]})}function ss({t}){const r=Math.max(2,t.entrants.length),n=Math.ceil(Math.log2(r)),l=s=>{const i=Math.ceil(r/2**(s-1));return i<=2?"Final":i<=4?"Semi-final":i<=8?"Quarter-final":`Round ${s}`},o=["Registration",...Array.from({length:n},(s,i)=>l(i+1)),"Champion"],a=t.phase==="Finished"?o.length:t.round;return e.jsx("ol",{className:"milestones","aria-label":"Bracket progress",children:o.map((s,i)=>e.jsxs("li",{className:i<a?"done":i===a?"now":"","aria-current":i===a?"step":void 0,children:[e.jsx("i",{children:i<a?"✓":i+1}),e.jsx("span",{children:s})]},s+i))})}const rs={buy:"bought",sell:"sold",spoils:"paid spoils:",convert:"was converted:",claim:"burned to convert",reward:"earned the creator reward:"};function as(t){if(t.phase==="Finished")return t.champion!==null?[t.champion]:[];if(t.phase==="Registration")return t.entrants.map((n,l)=>l);const r=t.rounds[t.rounds.length-1]?.find(n=>n.b!==null)??t.rounds[t.rounds.length-1]?.[0];return r?r.b===null?[r.a]:[r.a,r.b]:[]}function os({id:t,account:r}){const{data:n,error:l,refresh:o}=me(()=>Qn(t,r),[t,r],5e3),a=Ye(),{busy:s,run:i}=_e(o),[d,u]=b.useState(null),[f,m]=b.useState([]),h=n?`${n.state.t.phase}-${n.state.t.round}-${n.state.t.entrants.length}`:"",c=n?d&&d.key===h?d.ids:as(n.state.t):[],g=c.join(","),p=n?c.reduce((y,S)=>y+(n.state.info[S]?.trades??0),0):0;if(b.useEffect(()=>{n&&Xn(n.state,c).then(m).catch(()=>{})},[g,p,h]),l&&!n)return e.jsx("p",{className:"error",children:l});if(!n)return e.jsx("p",{className:"muted",children:"Loading bracket…"});const{state:x,mine:j}=n,{t:w}=x,k=fe(x,a),_=w.phase!=="Finished"&&k<=0,O=Je(x),Y=y=>{if(r&&y===r)return{kind:"you",label:"You"};const S=w.entrants.find(U=>U.token===y);if(S)return{kind:"contract",label:`${S.name} contract`};const A=w.entrants.find(U=>U.creator===y);return A?{kind:"creator",label:`Creator · ${A.name}`}:y===E?{kind:"contract",label:"Arena"}:{kind:"trader",label:"Trader"}},K=j?w.entrants.map((y,S)=>S).filter(y=>j.claimable[y]>0n&&!c.includes(y)):[],F=async()=>{await ue(r)&&i("settle","Matches settled on-chain.",async()=>{const y=[...O].sort((S,A)=>BigInt(x.info[S].score)<BigInt(x.info[A].score)?-1:1);for(const S of y)(await C(w.entrants[S].token,"get_info")).status==="Live"&&await G(w.entrants[S].token,"settle",{},{gas:150n*he})},!0)},V=async()=>{await ue(r)&&i("advance","Bracket advanced.",()=>G(E,"advance",{tournament_id:w.id},{gas:300n*he}),!0)};return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"secrule tight",children:[e.jsx("span",{children:"01"}),e.jsx("i",{}),e.jsxs("span",{children:["/BRACKET · ",w.phase.toUpperCase()]})]}),e.jsx("a",{className:"back",href:"#/app",children:"← All brackets"}),e.jsxs("h1",{className:"ttitle",children:["$",w.ticker,w.season>1&&e.jsxs("small",{children:["season ",w.season]})]}),e.jsx(ss,{t:w}),e.jsx("section",{className:`banner ${_?"bell":"live"}`,children:w.phase==="Finished"?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"pill done",children:"FINISHED"}),e.jsx("span",{children:w.champion!==null?`${w.entrants[w.champion].name} absorbed every other $${w.ticker}. A new $${w.ticker} launched here will have to face it.`:"Nobody launched."})]}):_?O.length>0?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"pill bell",children:"TIME'S UP"}),e.jsxs("span",{children:["Trading is frozen. ",O.length/2," match",O.length===2?"":"es"," to settle; the caller earns a bounty from the loser's reserve."]}),e.jsx("button",{className:"btn big",disabled:!!s,onClick:F,children:s?"Settling…":"Settle matches"})]}):e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"pill bell",children:"TIME'S UP"}),e.jsxs("span",{children:[w.phase==="Registration"?"Registration is closed.":"All matches are settled."," Anyone can draw the next round and earns a small bounty."]}),e.jsx("button",{className:"btn big",disabled:!!s,onClick:V,children:s?"Advancing…":Ae(w).filter(y=>x.info[y].status!=="Lost").length<=1?"Crown the champion":"Start the next round"})]}):e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"pill live",children:Ie(w,w.round).toUpperCase()}),e.jsx("span",{className:"clock mono",children:He(k)}),e.jsx("span",{children:w.phase==="Registration"?`${w.entrants.length} cop${w.entrants.length===1?"y":"ies"} of $${w.ticker} registered. Inflow now decides the seeding.`:`${Ae(w).length} coins left. Sell tax is ramping up to ${x.info[0].penalty_bps/100}% at the bell.`})]})}),e.jsx(ns,{s:x,selected:c,select:y=>u({key:h,ids:y})}),c.length===2&&x.info[c[0]].rival===w.entrants[c[1]].token&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"tug",children:[e.jsx("b",{className:"a",children:Se(x.info[c[0]].score)}),e.jsx(Wn,{a:x.info[c[0]].score,b:x.info[c[1]].score,label:"Round score, side by side"}),e.jsx("b",{className:"b",children:Se(x.info[c[1]].score)})]}),e.jsx("p",{className:"tugnote",children:"Round score in NEAR-hours: NEAR that came in since the round started × how long it stayed. Old liquidity scores nothing."})]}),e.jsx("div",{className:"ring",children:c.map((y,S)=>e.jsx($t,{s:x,idx:y,side:c.length===2?S===0?"a":"b":"n",mine:j,account:r,refresh:o,now:a},y))}),K.length>0&&e.jsxs("section",{children:[e.jsx("h2",{children:"Your bags to convert"}),e.jsx("div",{className:"ring",children:K.map(y=>e.jsx($t,{s:x,idx:y,side:"n",mine:j,account:r,refresh:o,now:a},y))})]}),e.jsxs("section",{children:[e.jsx("h2",{children:"Log"}),f.length===0?e.jsx("p",{className:"muted",children:"No trades yet."}):e.jsx("ul",{className:"log",children:f.map((y,S)=>{const A=w.entrants[y.coin]?.name??"";return e.jsxs("li",{className:c.indexOf(y.coin)===1?"b":"a",children:[e.jsx("span",{className:"dot"}),e.jsxs("span",{className:"who",children:[e.jsx("span",{className:`role ${Y(y.account).kind}`,children:Y(y.account).label}),Y(y.account).kind==="you"?null:de(y.account)]}),e.jsxs("span",{children:[rs[y.kind]," ",y.kind==="reward"?e.jsxs(e.Fragment,{children:[e.jsxs("b",{children:[v(y.near,3)," NEAR"]})," for launching ",A]}):y.kind==="spoils"?e.jsxs(e.Fragment,{children:[e.jsxs("b",{children:[v(y.near)," NEAR"]})," into ",A,", no mint"]}):y.kind==="convert"?e.jsxs(e.Fragment,{children:[e.jsx("b",{children:$(y.tokens)})," ",A," minted for ",v(y.near)," NEAR"]}):y.kind==="claim"?e.jsxs(e.Fragment,{children:[e.jsx("b",{children:$(y.tokens)})," ",A]}):e.jsxs(e.Fragment,{children:[e.jsx("b",{children:$(y.tokens)})," ",A," for ",v(y.near,3)," NEAR (",y.kind==="buy"?"mint":"burn",")"]})]}),e.jsx("time",{children:an(y.ts,a+x.skew)})]},S)})})]})]})}function is(){const{data:t}=me(()=>C(E,"get_config"),[],6e4),r=t?.penalty_bps??xe.penaltyBps,n=t?Number(BigInt(t.virtual_near)/10n**24n):xe.virtualNear,l=b.useMemo(()=>on({...xe,penaltyBps:r,virtualNear:n}),[r,n]),[o,a]=b.useState(1),[s,i]=b.useState("score"),d=l[o],u=m=>"AB"[m],f=r/100;return e.jsxs("div",{className:"rules",children:[e.jsx(R,{n:"03",label:"RULES",title:"the rules",children:e.jsx("p",{className:"secsub",children:"Everything on this page is enforced by the contracts. The arena has no owner and no access key, the tokens have no admin method, and the token code is pinned by hash. Nobody can change a number after launch."})}),e.jsxs("div",{className:"params",children:[e.jsxs("div",{children:[e.jsx("dt",{children:"Registration"}),e.jsx("dd",{children:t?L(t.registration_ns):"…"})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Each round"}),e.jsx("dd",{children:t?L(t.round_ns):"…"})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Penalty / top sell tax"}),e.jsxs("dd",{children:[f,"%"]})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Coins per bracket"}),e.jsx("dd",{children:t?`up to ${t.max_entrants}`:"…"})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Minimum seed"}),e.jsx("dd",{children:t?`${v(t.min_seed,3)} NEAR`:"…"})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Post-win tax decay"}),e.jsx("dd",{children:t?L(t.cooldown_ns):"…"})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Curve depth"}),e.jsxs("dd",{children:[n," NEAR virtual"]})]}),e.jsxs("div",{children:[e.jsx("dt",{children:"Launch fee"}),e.jsx("dd",{children:t?`${v(t.launch_fee)} NEAR`:"…"})]})]}),e.jsxs("p",{className:"muted",children:["Read live from"," ",e.jsx("a",{href:`${_t}/address/${E}`,target:"_blank",rel:"noreferrer",children:E}),t&&e.jsxs(e.Fragment,{children:[" · token code hash ",t.token_code_hash]})]}),e.jsxs("ol",{className:"rulelist",children:[e.jsxs("li",{children:[e.jsx("b",{children:"One bracket per ticker."})," The first coin launched with a ticker opens its bracket. Every coin launched with that ticker during registration joins it. After registration the ticker is locked until one coin is left."]}),e.jsxs("li",{children:[e.jsx("b",{children:"Creators post a seed, one coin each."})," The seed buys the creator's first tokens from the coin's own curve, so an empty copy cannot take a slot for free. One account can launch only one coin per bracket."]}),e.jsxs("li",{children:[e.jsx("b",{children:"Seeding is by score."})," When a round closes the arena ranks the survivors by their score and pairs best against worst. With an odd number, the top seed sits the round out."]}),e.jsxs("li",{children:[e.jsx("b",{children:"Score is new NEAR × time."})," Each round a coin scores only the NEAR that came in since the round started, for as long as it stays. Liquidity it already had, including what it absorbed, scores nothing. Net outflow scores negative. Each wallet's net inflow counts for at most ",t?.score_cap?`${v(t.score_cap)} NEAR`:"a fixed cap"," per round, and trades made between rounds count towards the next one."]}),e.jsxs("li",{children:[e.jsx("b",{children:"Selling is taxed, and the tax stays in the curve."})," It ramps from 0 to ",f,"% over the round, so leaving just before the bell costs the same as losing. After a win it restarts at ",f,"% and decays, so winners cannot dump on the holders who were just converted in."]}),e.jsxs("li",{children:[e.jsx("b",{children:"At the bell, trading freezes."})," Anyone can settle a match and is paid 1% of the loser's reserve (at most 0.05 NEAR). The two tokens compare scores themselves."]}),e.jsxs("li",{children:[e.jsx("b",{children:"The loser is absorbed."})," ",f,"% of its reserve is the penalty: ",t?.creator_reward_bps!==void 0?t.creator_reward_bps/100:1,"% goes to the creator of the winning coin and the rest enters the winner's curve with no tokens minted. The other ",100-f,"% buys winner tokens, which the loser's holders claim pro rata by burning their dead coin."]}),e.jsxs("li",{children:[e.jsx("b",{children:"The champion defends."})," A later coin with the same ticker opens a new season, and the reigning champion is automatically entered in it."]})]}),e.jsx("h2",{children:"One match under different crowds"}),e.jsxs("p",{className:"muted",children:["Simulated before launch with the contract's formulas (",e.jsx("code",{children:"sim/duel-sim.ts"}),"): one ",xe.hours,"-hour round between coin A and coin B, using this arena's penalty and curve depth."]}),e.jsxs("div",{className:"filters",children:[e.jsx("div",{className:"tabs",role:"tablist","aria-label":"Scenario",children:l.map((m,h)=>e.jsx("button",{role:"tab","aria-selected":h===o,className:h===o?"on":"",onClick:()=>a(h),children:m.name},m.name))}),e.jsx("div",{className:"tabs",role:"tablist","aria-label":"Measure",children:ln.map(m=>e.jsx("button",{role:"tab","aria-selected":m.key===s,className:m.key===s?"on":"",onClick:()=>i(m.key),children:m.label},m.key))})]}),e.jsx("p",{className:"story",children:d.story}),e.jsx(cn,{result:d,metric:s}),e.jsxs("p",{className:"verdict",children:[e.jsxs("b",{children:[u(d.winner)," wins on score."]})," ",d.naiveWinner!==d.winner?`A rule that counted total NEAR in the curve at the bell would have picked ${u(d.naiveWinner)}.`:"Counting total NEAR in the curve would give the same winner here."," ",d.loserReserve.toFixed(1)," NEAR moves to the winner",d.loserTax>=.05?`, ${d.loserTax.toFixed(1)} of it sell tax left behind by holders who ran`:"","; ",d.spoils.toFixed(1)," NEAR of that is spoils, lifting the winner's price by ",d.winnerPriceBump.toFixed(1),"%."]}),e.jsx("div",{className:"tablewrap",children:e.jsxs("table",{children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Scenario"}),e.jsx("th",{children:"Winner"}),e.jsx("th",{children:"Net inflow A / B"}),e.jsx("th",{children:"Loser's reserve moved"}),e.jsx("th",{children:"of which sell tax"}),e.jsx("th",{children:"Spoils"}),e.jsx("th",{children:"Winner price"}),e.jsx("th",{children:"Supply after"})]})}),e.jsx("tbody",{children:l.map(m=>{const h=m.points[m.points.length-1];return e.jsxs("tr",{children:[e.jsx("td",{children:m.name}),e.jsxs("td",{children:[u(m.winner),m.naiveWinner!==m.winner&&` (total reserve: ${u(m.naiveWinner)})`]}),e.jsxs("td",{children:[h.inflow[0].toFixed(1)," / ",h.inflow[1].toFixed(1)]}),e.jsxs("td",{children:[m.loserReserve.toFixed(1)," NEAR"]}),e.jsx("td",{children:m.loserTax.toFixed(1)}),e.jsx("td",{children:m.spoils.toFixed(1)}),e.jsxs("td",{children:["+",m.winnerPriceBump.toFixed(1),"%"]}),e.jsxs("td",{children:[(m.supplyAfter[m.winner]/1e6).toFixed(0),"M ",u(m.winner)]})]},m.name)})})]})}),e.jsx("h2",{children:"Losing more than once"}),e.jsxs("p",{className:"muted",children:["A holder who is converted into a coin that then loses again is converted again. What is left of the stake, at this arena's ",f,"% penalty:"]}),e.jsx("div",{className:"params three",children:[1,2,3].map(m=>e.jsxs("div",{children:[e.jsxs("dt",{children:["after ",m," lost round",m>1?"s":""]}),e.jsxs("dd",{children:[dn(r,m).toFixed(0),"%"]})]},m))}),e.jsx("h2",{children:"Known limits"}),e.jsxs("ul",{className:"limits",children:[e.jsx("li",{children:"Score counts NEAR, not people. One wallet counts for at most the per-wallet cap each round, but a group of wallets, or one person with several, can pool money to carry a coin. Each extra wallet pays its own storage and fees; nothing checks who is behind it."}),e.jsx("li",{children:`The sell tax makes running before the bell no cheaper than losing. It does not force anyone to stay: see "Run for the exit", where almost all of the loser's liquidity leaves and the winner receives only the tax.`}),e.jsx("li",{children:"Spoils are locked liquidity. They lift the winner's price for every holder, but holders can only withdraw part of them; the rest stays in the curve as a floor."}),e.jsx("li",{children:"A bracket holds a fixed number of coins. Filling the remaining slots with copies from several wallets to shut a rival out is possible; it costs one wallet, one fee and one seed per slot, and those seeds flow to whoever beats them."}),e.jsx("li",{children:"With an odd number of coins the top seed skips the round, and a coin can get a bye again if it keeps drawing the most money. In a bracket of 5 it can reach the final without playing a match."}),e.jsx("li",{children:"Only coins launched here are in the bracket. Copies launched on other launchpads are out of reach."}),e.jsx("li",{children:"Each trade pays a flat 0.002 NEAR that stays in the token contract to pay for the on-chain log."})]})]})}function ls(){const[t,r]=b.useState(window.location.hash);return b.useEffect(()=>{const n=()=>{const l=window.location.hash;r(l),l!=="#faq"&&l!=="#how"&&window.scrollTo(0,0)};return window.addEventListener("hashchange",n),()=>window.removeEventListener("hashchange",n)},[]),t==="#how"||t==="#faq"?"":t.replace(/^#\/?/,"")}function cs({account:t}){const[r,n]=b.useState(!1);return t?e.jsxs("div",{className:"moreb walletb",children:[e.jsxs("button",{className:"btn ghost wallet",onClick:()=>n(l=>!l),"aria-expanded":r,title:t,children:[e.jsx("span",{className:"role you",children:"You"})," ",de(t)]}),r&&e.jsxs("div",{className:"moremenu right",onClick:()=>n(!1),children:[e.jsx("span",{className:"menuacct",children:t}),e.jsx("button",{onClick:()=>P.disconnect(),children:"Disconnect"})]})]}):e.jsx("button",{className:"btn",onClick:()=>P.connect().catch(()=>{}),children:"Connect wallet"})}const ds=[{href:"#/app",label:"Brackets",match:t=>t==="app"||t.startsWith("t/")},{href:"#/launch",label:"Launch a coin",match:t=>t.startsWith("launch")},{href:"#/rules",label:"Rules",match:t=>t==="rules"}];function hs(){const t=ls(),r=In(),[n,l]=b.useState(!1),o=t===""||t==="faq",a=t.match(/^t\/(\d+)$/)?.[1],s=t.match(/^launch\/([A-Za-z0-9]{2,8})$/)?.[1]?.toUpperCase()??"";return o?e.jsxs(e.Fragment,{children:[e.jsxs("header",{className:"top landingtop onhero",children:[e.jsx(Qe,{short:!0}),e.jsxs("div",{className:"topright",children:[e.jsx(Xe,{}),e.jsx("a",{className:"btn ghost pitchbtn",href:"pitch/",children:"Pitch"}),e.jsx("a",{className:"btn",href:"#/app",children:"Open app"})]})]}),e.jsx("main",{className:"lmain",children:e.jsx(qn,{})}),e.jsx(Nt,{})]}):e.jsxs(Ut.Provider,{value:r,children:[e.jsxs("header",{className:"top apptop",children:[e.jsx(Qe,{}),e.jsxs("nav",{className:"appnav","aria-label":"App",children:[ds.map(i=>e.jsx("a",{href:i.href,className:i.match(t)?"on":"",children:i.label},i.href)),e.jsxs("div",{className:"moreb",children:[e.jsx("button",{onClick:()=>l(i=>!i),"aria-expanded":n,children:"More"}),n&&e.jsxs("div",{className:"moremenu",onClick:()=>l(!1),children:[e.jsx("a",{href:"#/faq",children:"FAQ"}),e.jsx("a",{href:"#/",children:"About HITC"})]})]})]}),e.jsxs("div",{className:"topright",children:[e.jsxs("span",{className:"envchip",children:[e.jsx("i",{})," ","Live on NEAR testnet"]}),e.jsx(Xe,{}),e.jsx("a",{className:"btn ghost pitchbtn",href:"pitch/",children:"Pitch"}),e.jsx(cs,{account:r})]})]}),e.jsxs("main",{className:"appmain",children:[a?e.jsx(os,{id:Number(a),account:r}):t.startsWith("launch")?e.jsx(Yn,{account:r,ticker:s}):t==="rules"?e.jsx(is,{}):e.jsx(Hn,{account:r}),e.jsxs("footer",{className:"foot",children:["Rules live in the contracts. No owner, no admin key, no upgrade. ",e.jsx("a",{href:"#/rules",children:"Read the rules"})]})]}),e.jsx(hn,{}),e.jsx(Nt,{})]})}un.createRoot(document.getElementById("root")).render(e.jsx(b.StrictMode,{children:e.jsx(hs,{})}));
