const $ = (id) => document.getElementById(id);
let currentPosition = null;
let map = null;
let userMarker = null;
let placeLayer = null;
let installPrompt = null;
let toastTimer = null;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
}
function safeText(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function getContacts() {
  try { return JSON.parse(localStorage.getItem("shieldshe_contacts") || "[]"); }
  catch { return []; }
}
function saveContacts(list) {
  localStorage.setItem("shieldshe_contacts", JSON.stringify(list));
  renderContacts();
}
function renderContacts() {
  const list = getContacts();
  const box = $("contactsList");
  if (!list.length) { box.innerHTML = '<p class="muted">No contacts added yet.</p>'; return; }
  box.innerHTML = list.map((c,i) => `<div class="contact-row"><div><strong>${safeText(c.name)}</strong><small>${safeText(c.phone)}</small></div><button class="remove-contact" data-remove="${i}" type="button">Remove</button></div>`).join("");
  box.querySelectorAll("[data-remove]").forEach(btn => btn.addEventListener("click", () => {
    const updated = getContacts(); updated.splice(Number(btn.dataset.remove),1); saveContacts(updated); toast("Contact removed from this device.");
  }));
}
function requestLocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("This browser does not support location."));
    navigator.geolocation.getCurrentPosition(pos => {
      currentPosition = {lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy};
      $("locationStatus").textContent = `Location available · approx. ${Math.round(pos.coords.accuracy)} m accuracy`;
      if (map) showUserOnMap();
      resolve(currentPosition);
    }, err => {
      const messages = {1:"Location permission was denied.",2:"Your location is unavailable.",3:"Location request timed out."};
      reject(new Error(messages[err.code] || "Could not get location."));
    }, {enableHighAccuracy:true, timeout:12000, maximumAge:60000});
  });
}
function ensureMap(lat=17.385, lon=78.4867) {
  if (!window.L) { toast("Map library could not load. Check your internet connection."); return; }
  if (!map) {
    map = L.map("map").setView([lat,lon], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    placeLayer = L.layerGroup().addTo(map);
  } else map.setView([lat,lon],13);
}
function showUserOnMap() {
  if (!currentPosition || !map) return;
  if (userMarker) userMarker.remove();
  userMarker = L.circleMarker([currentPosition.lat,currentPosition.lon], {radius:9,color:"#fff",weight:3,fillColor:"#8d2869",fillOpacity:1}).addTo(map).bindPopup("Your device location");
  map.setView([currentPosition.lat,currentPosition.lon],14);
  $("directionsLink").href = `https://www.google.com/maps/dir/?api=1&destination=${currentPosition.lat},${currentPosition.lon}`;
}
async function findNearbyHelp() {
  $("findHelpBtn").disabled = true; $("findHelpBtn").textContent = "Searching…";
  try {
    const p = await requestLocation();
    ensureMap(p.lat,p.lon); showUserOnMap();
    const query = `[out:json][timeout:20];(node(around:5000,${p.lat},${p.lon})[amenity~"^(police|hospital|clinic|doctors|fire_station)$"];way(around:5000,${p.lat},${p.lon})[amenity~"^(police|hospital|clinic|doctors|fire_station)$"];relation(around:5000,${p.lat},${p.lon})[amenity~"^(police|hospital|clinic|doctors|fire_station)$"];);out center tags;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:"data="+encodeURIComponent(query)});
    if (!res.ok) throw new Error("Nearby place service is temporarily unavailable.");
    const data = await res.json();
    placeLayer.clearLayers();
    const items = (data.elements||[]).map(e => {
      const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
      if (typeof lat !== "number" || typeof lon !== "number") return null;
      const tags = e.tags||{};
      const type = tags.amenity || "public facility";
      const name = tags.name || ({police:"Police station",hospital:"Hospital",clinic:"Clinic",doctors:"Medical practice",fire_station:"Fire station"}[type] || "Public facility");
      return {lat,lon,type,name,address:[tags["addr:street"],tags["addr:city"]].filter(Boolean).join(", ")};
    }).filter(Boolean).slice(0,30);
    const placesBox = $("placesList");
    if (!items.length) { placesBox.innerHTML='<p class="muted">No mapped facilities were found within 5 km. Try Google Maps or call emergency services if urgent.</p>'; toast("No mapped facilities found nearby."); return; }
    items.forEach((it,i) => L.marker([it.lat,it.lon]).addTo(placeLayer).bindPopup(`<strong>${safeText(it.name)}</strong><br>${safeText(it.type)}`));
    map.fitBounds(L.latLngBounds(items.map(x=>[x.lat,x.lon]).concat([[p.lat,p.lon]])).pad(.15));
    placesBox.innerHTML = items.map(it => `<div class="place-card"><strong>${safeText(it.name)}</strong><span class="muted">${safeText(it.type)}${it.address ? " · "+safeText(it.address):""}</span><br><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lon}">Directions ↗</a></div>`).join("");
    toast(`Found ${items.length} mapped facilities. Please verify details before relying on them.`);
  } catch (e) {
    toast(e.message || "Could not search nearby facilities.");
  } finally {
    $("findHelpBtn").disabled = false; $("findHelpBtn").textContent = "Find nearby help";
  }
}
function smsLink(message, phone) {
  const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const sep = isApple ? "&" : "?";
  return `sms:${phone||""}${sep}body=${encodeURIComponent(message)}`;
}
function getLocationLine() {
  return currentPosition ? `My approximate location: https://maps.google.com/?q=${currentPosition.lat},${currentPosition.lon}` : "I could not share my location yet.";
}

async function prepareSOS() {
  const button = $("sosBtn");
  if (button) button.disabled = true;

  try {
    if (!currentPosition) {
      try {
        await requestLocation();
      } catch (e) {
        toast(
          e.message +
          " Your SOS message can still be prepared without location."
        );
      }
    }

    const message =
      `SOS — I may need help. Please contact me and check on me. ${getLocationLine()}`;

    const contacts = getContacts();

    if (navigator.share) {
      try {
        await navigator.share({
          title: "ShieldShe SOS",
          text: message
        });
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }

    if (contacts.length) {
      const first = contacts[0];

      if (
        confirm(
          `Prepare an SOS SMS for ${first.name} (${first.phone})? ` +
          "Review the message and send it yourself."
        )
      ) {
        window.location.href = smsLink(message, first.phone);
        return;
      }

      return;
    }

    if (
      confirm(
        "No trusted contacts are saved. Open a message with your SOS text? " +
        "You will need to choose a recipient and send it yourself."
      )
    ) {
      window.location.href = smsLink(message, "");
    }
  } catch (e) {
    toast("Could not prepare the SOS message. Please try again.");
  } finally {
    if (button) button.disabled = false;
  }
}

function playFakeCall() {
  $("callOverlay").classList.remove("hidden");
  $("callSubtitle").textContent = "Incoming call simulation";
  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Hello, it's Mum. Where are you? I'm waiting for you. Call me back when you can. Is everything okay? I can stay on the phone with you.");
    utterance.lang = "en-IN"; utterance.rate = 0.92; utterance.pitch = 1.03;
    utterance.onstart = () => $("callSubtitle").textContent = "Speaking… this is a simulated call.";
    utterance.onerror = () => $("callSubtitle").textContent = "Your browser could not play the voice. Try another browser.";
    speechSynthesis.speak(utterance);
  } else $("callSubtitle").textContent = "Voice playback is not supported by this browser.";
}
function endFakeCall() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  $("callOverlay").classList.add("hidden");
}
function updateRisk() {
  const value = $("riskLevel").value;
  const advice = {
    low:{title:"Low risk",text:"Stay aware of your surroundings and keep your phone charged. Share your plan if useful."},
    moderate:{title:"Moderate risk",text:"Consider moving toward a well-lit, populated place, calling someone you trust, and sharing your trip. If uncertain, choose a staffed public facility."},
    high:{title:"High risk",text:"Prioritise getting to a populated, staffed place if you can do so safely. Contact a trusted person or local emergency services. In India, call 112 for immediate danger."}
  }[value];
  const box=$("riskAdvice"); box.className=`risk-advice ${value}`; box.innerHTML=`<strong>${advice.title}</strong><p>${advice.text}</p>`;
}
$("contactForm").addEventListener("submit", e => {
  e.preventDefault();
  const name=$("contactName").value.trim(), phone=$("contactPhone").value.trim();
  if (!name || !phone) return;
  const list=getContacts();
  if (list.length>=10) { toast("You can save up to 10 contacts in this prototype."); return; }
  list.push({name,phone}); saveContacts(list); $("contactForm").reset(); toast("Trusted contact saved on this device.");
});
$("sosBtn").addEventListener("click",prepareSOS);
$("fakeCallBtn").addEventListener("click",playFakeCall);
$("declineCallBtn").addEventListener("click",endFakeCall);
$("answerCallBtn").addEventListener("click",() => { if ("speechSynthesis" in window) speechSynthesis.resume(); $("callSubtitle").textContent="Call answered — simulated voice is playing."; });
$("findHelpBtn").addEventListener("click",findNearbyHelp);
$("riskLevel").addEventListener("change",updateRisk);
$("navBtn").addEventListener("click", async () => {
  try { const p=currentPosition||await requestLocation(); window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`,"_blank","noopener"); }
  catch(e) { window.open("https://www.google.com/maps","_blank","noopener"); toast(e.message); }
});
$("checkinBtn").addEventListener("click", async () => {
  try { if (!currentPosition) await requestLocation(); } catch(e) { /* message still useful without location */ }
  const message=`Safety check-in: I'm checking in with you. ${getLocationLine()}`;
  const contacts=getContacts();
  if (contacts.length) {
    const c=contacts[0];
    if (confirm(`Prepare check-in SMS to ${c.name}? You must send it yourself.`)) { window.location.href=smsLink(message,c.phone); return; }
  }
  if (navigator.share) { try { await navigator.share({title:"Safety check-in",text:message}); } catch(e) {} }
  else { await navigator.clipboard?.writeText(message); toast("Check-in text copied if clipboard permission is available."); }
});
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt=e; $("installBtn").classList.remove("hidden"); });
$("installBtn").addEventListener("click", async () => {
  if (!installPrompt) { toast("Use your browser menu and choose Add to Home Screen or Install app."); return; }
  installPrompt.prompt(); await installPrompt.userChoice; installPrompt=null; $("installBtn").classList.add("hidden");
});
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
renderContacts(); updateRisk(); ensureMap();


/* ShieldShe Protector - Supabase setup */
const SUPABASE_URL = "https://gngbalmgyxuihqhwdwlz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_CG23vgMDOEBAQe2xQp5BbA_3xOw1fuS";


/* Connect ShieldShe Protector to Supabase */
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

console.log("ShieldShe Protector: Supabase client initialized");



/* Test the ShieldShe Supabase database connection */
async function testSupabaseConnection() {
  try {
    const { data, error } = await supabaseClient
      .from("connection_test")
      .select("status")
      .eq("id", 1)
      .single();

    if (error) {
      console.error("Supabase database test failed:", error.message);
      return;
    }

    console.log("Supabase database test:", data.status);
  } catch (err) {
    console.error("Supabase test error:", err);
  }
}

testSupabaseConnection();



/* ShieldShe Protector: Login and Registration */
(function setupShieldSheAuth() {
if (!window.supabase || typeof supabaseClient === "undefined") {
    console.error("Supabase client is not available.");
    return;
  }

  const client = supabaseClient;

  const style = document.createElement("style");
  style.textContent = `
    #shield-auth {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: #fff7fa;
      display: grid;
      place-items: center;
      padding: 20px;
      font-family: Arial, sans-serif;
    }
    #shield-auth .auth-card {
      width: 100%;
      max-width: 390px;
      box-sizing: border-box;
      padding: 28px;
      border-radius: 20px;
      background: white;
      box-shadow: 0 8px 35px #53233a20;
    }
    #shield-auth h2 { color: #a51d58; margin-top: 0; }
    #shield-auth input, #shield-auth button {
      box-sizing: border-box;
      width: 100%;
      padding: 12px;
      margin: 7px 0;
      border-radius: 9px;
      font-size: 15px;
    }
    #shield-auth input { border: 1px solid #ccc; }
    #shield-auth button {
      border: 0;
      background: #b42363;
      color: white;
      cursor: pointer;
    }
    #shield-auth .secondary {
      background: #f5e5ed;
      color: #85204d;
    }
    #shield-auth #shield-auth-message {
      overflow-wrap: anywhere;
      font-size: 14px;
    }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("div");
  panel.id = "shield-auth";
  panel.innerHTML = `
    <div class="auth-card">
      <h2>ShieldShe Protector</h2>
      <p>Sign in or create an account to continue.</p>
      <form id="shield-auth-form">
        <input id="shield-auth-email" type="email"
          placeholder="Email address" autocomplete="email" required>
        <input id="shield-auth-password" type="password"
          placeholder="Password (at least 8 characters)"
          autocomplete="current-password" minlength="8" required>
        <button type="submit" id="shield-auth-submit">Log In</button>
      </form>
      <button type="button" class="secondary" id="shield-auth-toggle">
        Create Account
      </button>
      <button type="button" class="secondary" id="shield-auth-reset">
        Forgot Password?
      </button>
      <p id="shield-auth-message" role="status" aria-live="polite"></p>
      <button type="button" id="shield-auth-logout" hidden>
        Sign Out
      </button>
    </div>
  `;
  document.body.appendChild(panel);

  const form = panel.querySelector("#shield-auth-form");
  const emailInput = panel.querySelector("#shield-auth-email");
  const passwordInput = panel.querySelector("#shield-auth-password");
  const submit = panel.querySelector("#shield-auth-submit");
  const toggle = panel.querySelector("#shield-auth-toggle");
  const reset = panel.querySelector("#shield-auth-reset");
  const message = panel.querySelector("#shield-auth-message");
  const logout = panel.querySelector("#shield-auth-logout");

  let mode = "login";

  toggle.addEventListener("click", () => {
    mode = mode === "login" ? "signup" : "login";
    submit.textContent = mode === "login" ? "Log In" : "Create Account";
    toggle.textContent = mode === "login" ? "Create Account" : "Back to Log In";
    passwordInput.autocomplete =
      mode === "login" ? "current-password" : "new-password";
    message.textContent = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    message.textContent = "Please wait…";

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
      const result = mode === "login"
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin +
                window.location.pathname
            }
          });

      if (result.error) throw result.error;

      message.textContent = mode === "signup"
        ? "Account request submitted. Check your email to confirm registration if required."
        : "Signed in successfully.";

      if (mode === "login" && result.data.session) {
        panel.remove();
        style.remove();
      }
    } catch (error) {
      message.textContent = error.message || "Authentication failed.";
    } finally {
      submit.disabled = false;
    }
  });

  reset.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) {
      message.textContent = "Enter your email address first.";
      return;
    }

    try {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
      message.textContent = "If the account exists, password-reset instructions will be emailed.";
    } catch (error) {
      message.textContent = error.message || "Could not request password reset.";
    }
  });

  logout.addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) {
      message.textContent = error.message;
      return;
    }
    window.location.reload();
  });

  client.auth.onAuthStateChange((event, session) => {
    if (session && event === "SIGNED_IN") {
      panel.remove();
      style.remove();
    }
  });

  client.auth.getSession().then(({ data, error }) => {
    if (error) {
      message.textContent = error.message;
      return;
    }
    if (data.session) {
      panel.remove();
      style.remove();
    }
  });
})();



/* ShieldShe Protector - Emergency Contacts */
(function setupEmergencyContacts() {
  if (typeof supabaseClient === "undefined") {
    console.error("Supabase client is not available.");
    return;
  }

  const client = supabaseClient;

  function createContactsPanel(user) {
    let panel = document.getElementById("shield-emergency-contacts");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "shield-emergency-contacts";

      Object.assign(panel.style, {
        position: "relative",
        maxWidth: "520px",
        margin: "24px auto",
        padding: "20px",
        background: "#ffffff",
        color: "#222222",
        border: "1px solid #dddddd",
        borderRadius: "14px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        fontFamily: "Arial, sans-serif",
        zIndex: "10"
      });

      panel.innerHTML = `
        <h2 style="margin-top:0">Emergency Contacts</h2>
        <p>Add trusted people you may need help contacting.</p>
        <form id="shield-contact-form">
          <label for="shield-contact-name">Contact name</label>
          <input id="shield-contact-name" required maxlength="100"
            placeholder="Enter name"
            style="display:block;box-sizing:border-box;width:100%;padding:10px;margin:6px 0 12px">

          <label for="shield-contact-phone">Phone number</label>
          <input id="shield-contact-phone" type="tel" required maxlength="20"
            placeholder="Enter phone number"
            style="display:block;box-sizing:border-box;width:100%;padding:10px;margin:6px 0 12px">

          <button type="submit" style="padding:10px 16px;cursor:pointer">
            Save Contact
          </button>
        </form>
        <p id="shield-contact-message" role="status" aria-live="polite"></p>
        <h3>Saved contacts</h3>
        <ul id="shield-contact-list"></ul>
      `;

      document.body.appendChild(panel);
    }

    const form = document.getElementById("shield-contact-form");
    const message = document.getElementById("shield-contact-message");
    const list = document.getElementById("shield-contact-list");

    async function loadContacts() {
      list.replaceChildren();

      const { data, error } = await client
        .from("emergency_contacts")
        .select("id, contact_name, phone_number")
        .order("created_at", { ascending: false });

      if (error) {
        message.textContent = "Could not load contacts: " + error.message;
        return;
      }

      if (!data || data.length === 0) {
        list.textContent = "No contacts saved yet.";
        return;
      }

      data.forEach((contact) => {
        const item = document.createElement("li");
        item.style.marginBottom = "12px";

        const details = document.createElement("span");
        details.textContent =
          contact.contact_name + " — " + contact.phone_number + " ";

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.textContent = "Delete";
        removeButton.addEventListener("click", async () => {
          if (!window.confirm("Delete this emergency contact?")) return;

          const { error: deleteError } = await client
            .from("emergency_contacts")
            .delete()
            .eq("id", contact.id)
            .eq("user_id", user.id);

          if (deleteError) {
            message.textContent = "Delete failed: " + deleteError.message;
            return;
          }

          message.textContent = "Contact deleted.";
          await loadContacts();
        });

        item.append(details, removeButton);
        list.appendChild(item);
      });
    }

    form.onsubmit = async (event) => {
      event.preventDefault();
      message.textContent = "Saving contact…";

      const contactName = document
        .getElementById("shield-contact-name").value.trim();
      const phoneNumber = document
        .getElementById("shield-contact-phone").value.trim();

      if (!contactName || !phoneNumber) {
        message.textContent = "Enter both the name and phone number.";
        return;
      }

      const { error } = await client
        .from("emergency_contacts")
        .insert({
          user_id: user.id,
          contact_name: contactName,
          phone_number: phoneNumber
        });

      if (error) {
        message.textContent = "Save failed: " + error.message;
        return;
      }

      form.reset();
      message.textContent = "Contact saved successfully.";
      await loadContacts();
    };

    loadContacts();
  }

  async function checkLogin() {
    const { data, error } = await client.auth.getUser();

    if (error || !data.user) {
      document.getElementById("shield-emergency-contacts")?.remove();
      return;
    }

    createContactsPanel(data.user);
  }

  checkLogin();

  client.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      setTimeout(() => createContactsPanel(session.user), 0);
    } else {
      document.getElementById("shield-emergency-contacts")?.remove();

      
/* ShieldShe Protector - Safe SOS backend test */
async function testShieldSheSOSBackend() {
  const message = "SOS backend test";

  try {
    const { data: sessionData, error: sessionError } =
      await supabaseClient.auth.getSession();

    if (sessionError || !sessionData.session) {
      alert("Please log in before testing the SOS backend.");
      return;
    }

    const { data, error } = await supabaseClient.functions.invoke(
      "send-sos-alert",
      {
        body: { test: true }
      }
    );

    if (error) {
      console.error("SOS backend test failed:", error);
      alert("Backend test failed. Open the browser console for details.");
      return;
    }

    console.log(message, data);
    alert(data?.message || "Backend response received. No SMS was sent.");
  } catch (err) {
    console.error("SOS backend test error:", err);
    alert("Could not reach the SOS backend. Check the browser console.");
  }
}

window.testShieldSheSOSBackend = testShieldSheSOSBackend;

    }
  });
})();




