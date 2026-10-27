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
