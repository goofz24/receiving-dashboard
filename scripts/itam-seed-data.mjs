// Builds the MADE-UP sample data for the IT asset tracker.
//
// Every person, email, serial number, invoice and price here is invented.
// Emails use example.com, a domain kept for examples. Random numbers come
// from a fixed seed, so the data is the same on every run and the tests
// can check exact totals.
//
// Days are stored as "days from today" (negative = in the past). The SQL
// file turns them into  current_date - N  so the data always looks recent.
//
// The people and devices are written out by hand on purpose, so that the
// dashboard has a few clear problems to find: people who left and still
// have a laptop, warranties about to end, a laptop with BitLocker off, a
// license with more users than seats, and so on.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOCATIONS = [
  { name: "Ponce warehouse", city: "Ponce, PR" },
  { name: "San Juan store", city: "San Juan, PR" },
  { name: "Houston office", city: "Houston, TX" },
  { name: "Remote", city: "Works from home" },
];
const LOC = { ponce: 1, sanjuan: 2, houston: 3, remote: 4 };

// [key, category, manufacturer, model, warranty months, useful life months, cost, vendor]
const MODELS = [
  ["latitude", "laptop", "Dell", "Latitude 5450", 36, 48, 1189, "Ceiba Office Supply"],
  ["thinkpad", "laptop", "Lenovo", "ThinkPad T14 Gen 5", 36, 48, 1249, "Bohio Tech Distributors"],
  ["elitebook", "laptop", "HP", "EliteBook 840 G11", 36, 48, 1329, "Bohio Tech Distributors"],
  ["macbook", "laptop", "Apple", "MacBook Air 13 (M3)", 12, 48, 1099, "Ceiba Office Supply"],
  ["optiplex", "desktop", "Dell", "OptiPlex 7020", 36, 60, 899, "Ceiba Office Supply"],
  ["p2425h", "monitor", "Dell", "P2425H 24 in", 36, 72, 219, "Ceiba Office Supply"],
  ["e24", "monitor", "HP", "E24 G5 24 in", 36, 72, 189, "Bohio Tech Distributors"],
  ["iphone", "phone", "Apple", "iPhone 15", 12, 36, 799, "Yunque Mobile Wireless"],
  ["galaxy", "phone", "Samsung", "Galaxy A55", 12, 36, 449, "Yunque Mobile Wireless"],
  ["et45", "tablet", "Zebra", "ET45 rugged tablet", 36, 60, 1450, "Bohio Tech Distributors"],
  ["wd19", "dock", "Dell", "WD19S dock", 36, 60, 239, "Ceiba Office Supply"],
  ["zd421", "printer", "Zebra", "ZD421 label printer", 12, 60, 529, "Bohio Tech Distributors"],
  ["laserjet", "printer", "HP", "LaserJet Pro 4001", 12, 60, 469, "Ceiba Office Supply"],
  ["latitude_old", "laptop", "Dell", "Latitude 5420", 36, 48, 1099, "Ceiba Office Supply"],  // the older laptops that were refreshed
];
const PREFIX = { laptop: "LT", desktop: "DT", monitor: "MN", phone: "PH", tablet: "TB", dock: "DK", printer: "PR" };

// [key, name, department, title, location, started (days ago, negative), left (or null)]
const PEOPLE = [
  ["vega", "Ana Lucia Vega", "Management", "Operations manager", "ponce", -2100, null],
  ["hayes", "Robert Hayes", "Management", "Regional manager", "houston", -1500, null],
  ["ortega", "Luis Ortega", "IT", "IT support specialist", "ponce", -1300, null],
  ["brooks", "Kayla Brooks", "IT", "IT support specialist", "houston", -400, null],
  ["cruz", "Marisol Cruz", "Finance", "Accountant", "sanjuan", -1800, null],
  ["kim", "Daniel Kim", "Finance", "Accounts payable clerk", "houston", -700, null],
  ["medina", "Paola Medina", "Finance", "Payroll specialist", "remote", -950, null],
  ["morales", "Javier Morales", "Sales", "Account manager", "sanjuan", -1650, null],
  ["carter", "Emily Carter", "Sales", "Account manager", "houston", -820, null],
  ["rosario", "Carlos Rosario", "Sales", "Sales associate", "sanjuan", -560, null],
  ["lopez", "Brianna Lopez", "Sales", "Sales associate", "houston", -300, null],
  ["santos", "Gabriel Santos", "Sales", "Sales associate", "sanjuan", -120, null],
  ["reyes", "Natalia Reyes", "Customer service", "Bilingual support rep", "remote", -1100, null],
  ["nguyen", "Kevin Nguyen", "Customer service", "Support rep", "houston", -640, null],
  ["figueroa", "Isabel Figueroa", "Customer service", "Bilingual support rep", "ponce", -380, null],
  ["ramos", "Diego Ramos", "Customer service", "Bilingual support rep", "remote", -200, null],
  ["rivera", "Miguel Rivera", "Receiving", "Receiving clerk", "ponce", -2000, null],
  ["torres", "Julia Torres", "Receiving", "Receiving clerk", "ponce", -1400, null],
  ["santiago", "Luz Santiago", "Receiving", "Receiving lead", "ponce", -1700, null],
  ["colon", "Andres Colon", "Receiving", "Receiving clerk", "ponce", -900, null],
  ["alvarez", "Pedro Alvarez", "Warehouse", "Warehouse associate", "ponce", -1250, null],
  ["pagan", "Yesenia Pagan", "Warehouse", "Warehouse associate", "ponce", -800, null],
  ["burgos", "Ramon Burgos", "Warehouse", "Warehouse associate", "ponce", -480, null],
  ["delgado", "Sofia Delgado", "Warehouse", "Warehouse associate", "ponce", -150, null],
  // new hires
  ["mercado", "Adrian Mercado", "Sales", "Sales associate", "sanjuan", -6, null],
  ["price", "Hannah Price", "Customer service", "Support rep", "houston", -3, null],
  ["nieves", "Victor Nieves", "Finance", "Accounts payable clerk", "remote", -1, null],
  // left in the last few months (the offboarding checks look at these)
  ["pabon", "Jose Pabon", "Sales", "Sales associate", "sanjuan", -900, -12],
  ["foster", "Megan Foster", "Sales", "Account manager", "houston", -1300, -40],
  ["feliciano", "Ricardo Feliciano", "Customer service", "Bilingual support rep", "remote", -500, -25],
  ["green", "Tasha Green", "Finance", "Accountant", "houston", -1100, -65],
  ["soto", "Wilfredo Soto", "Warehouse", "Warehouse associate", "ponce", -700, -8],
  ["marrero", "Elena Marrero", "Finance", "Payroll specialist", "remote", -1600, -55],
  // left long ago; everything was handed back
  ["wallace", "Frank Wallace", "Sales", "Account manager", "houston", -2000, -600],
  ["acevedo", "Gloria Acevedo", "Customer service", "Support rep", "remote", -1500, -420],
  ["lugo", "Hector Lugo", "Receiving", "Receiving clerk", "ponce", -1900, -800],
  ["chen", "Lisa Chen", "Sales", "Sales associate", "sanjuan", -1200, -300],
];

// [product, vendor, seats owned, cost per seat per year, renews in N days]
const LICENSES = [
  ["Microsoft 365 Business Premium", "Microsoft", 35, 264.0, 45],
  ["1Password Business", "1Password", 24, 95.88, 200],
  ["Slack Pro", "Slack", 18, 105.0, 130],
  ["Zoom Workplace Pro", "Zoom", 10, 159.9, 20],
  ["Adobe Acrobat Pro", "Adobe", 6, 239.88, 95],
];

// laptops bought about 3 years ago, so their warranty runs out soon
const WARRANTY_SOON = { ortega: -1075, torres: -1040, reyes: -1020 };

const RECEIVERS = ["M. Rivera", "J. Torres", "L. Santiago", "A. Colon"];

export function generateItamSeed(seed = 20261106) {
  const rand = mulberry32(seed);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const serialChars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const serial = (len) => Array.from({ length: len }, () => pick([...serialChars])).join("");

  const locations = LOCATIONS.map((l, i) => ({ location_id: i + 1, ...l }));

  const employees = PEOPLE.map(([key, name, department, title, loc, started, left], i) => {
    const [first, ...rest] = name.toLowerCase().split(" ");
    return {
      employee_id: i + 1, key, full_name: name,
      email: `${first}.${rest[rest.length - 1]}@example.com`,
      department, title, location_id: LOC[loc], started_offset: Number(started), left_offset: left === null ? null : Number(left),
    };
  });
  const emp = Object.fromEntries(employees.map((e) => [e.key, e]));

  const models = MODELS.map(([key, category, manufacturer, model_name, w, life, cost, vendor], i) => ({
    model_id: i + 1, key, category, manufacturer, model_name, warranty_months: Number(w), useful_life_months: Number(life), cost: Number(cost), vendor,
  }));
  const model = Object.fromEntries(models.map((m) => [m.key, m]));

  const assets = [];
  const events = [];
  const tagCount = {};
  let invoiceNo = 41000;

  // who did the IT work on a given day: before Luis joined, an outside contractor
  const itTech = (day) => (day < -1300 ? "IT contractor" : day < -400 ? "L. Ortega" : pick(["L. Ortega", "K. Brooks"]));
  const ev = (a, day, type, employee = null, note = null, by = null) => {
    events.push({ event_id: 0, asset_id: a.asset_id, event_offset: day, event_type: type, employee_id: employee?.employee_id ?? null,
      done_by: by ?? (type === "received" ? pick(RECEIVERS) : itTech(day)), note });
  };

  // Buys a device: creates the asset with 'ordered' and (unless still on the way) 'received' events.
  function buy(modelKey, purchased, locKey, { arrived = true } = {}) {
    const m = model[modelKey];
    tagCount[m.category] = (tagCount[m.category] ?? 0) + 1;
    const asset_id = assets.length + 1;
    const a = {
      asset_id,
      asset_tag: `IT-${PREFIX[m.category]}-${String(tagCount[m.category]).padStart(4, "0")}`,
      serial_number: `${m.manufacturer.slice(0, 2).toUpperCase()}${serial(8)}`,
      model_id: m.model_id,
      vendor: m.vendor,
      invoice_number: `INV-${++invoiceNo}`,
      purchased_offset: purchased,
      purchase_cost: m.cost,
      warranty_offset: purchased + Math.round(m.warranty_months * 30.44),
      location_id: LOC[locKey],
      category: m.category,
    };
    assets.push(a);
    ev(a, purchased - int(3, 9), "ordered", null, null, itTech(purchased));
    if (arrived) ev(a, purchased, "received");
    return a;
  }
  const deploy = (a, day, e, note = null) => ev(a, day, "deployed", e, note);
  const handBack = (a, day, e, note = null) => ev(a, day, "returned", e, note);

  // laptop model by department: Sales in Houston likes Macs, Finance gets ThinkPads, the rest mixed
  const laptopFor = (e) =>
    e.department === "Sales" && e.location_id === LOC.houston ? "macbook"
      : e.department === "Finance" ? "thinkpad"
        : pick(["latitude", "latitude", "elitebook", "thinkpad"]);
  const locKey = (e) => Object.keys(LOC).find((k) => LOC[k] === e.location_id);

  // ---- 1. old laptops that were refreshed: deployed, handed back, retired, some disposed ----
  const refreshed = ["vega", "rivera", "santiago", "cruz", "morales", "lugo", "hayes", "marrero"];
  const refreshDay = {};
  for (const k of refreshed) {
    const e = emp[k];
    const bought = Math.max(e.started_offset, -2350) - int(5, 30);
    const old = buy("latitude_old", bought, locKey(e));
    deploy(old, Math.max(bought + int(1, 5), e.started_offset), e);
    const back = Math.min(bought + 1461 + int(10, 120), e.left_offset ?? -1, -20);  // about 4 years later
    refreshDay[k] = back;
    handBack(old, back, e, "Laptop refresh");
    ev(old, back + int(1, 5), "retired", null, "Past useful life");
    if (rand() < 0.6) ev(old, back + int(20, 60), "disposed", null, "Certified e-waste recycler, data wipe certificate on file");
  }

  // ---- 2. laptops that came back from people who left long ago and went to someone new ----
  const handMeDown = [["wallace", "lopez"], ["acevedo", "figueroa"], ["chen", "santos"], ["marrero", "price"]];
  const laptopOf = {};
  const handedDown = new Set(handMeDown.map(([fromK]) => fromK));
  for (const [fromK, toK] of handMeDown) {
    const from = emp[fromK], to = emp[toK];
    const start = refreshDay[fromK] ?? from.started_offset;
    const bought = Math.max(start, from.left_offset - 1100) - int(2, 20);
    const a = buy(laptopFor(from), bought, locKey(to));
    deploy(a, Math.max(bought + int(1, 6), start), from);
    handBack(a, from.left_offset, from, "Left the company");
    deploy(a, to.started_offset, to, "Re-imaged and re-issued");
    laptopOf[toK] = a;
  }

  // ---- 3. everyone's own devices ----
  const needsLaptop = (e) => e.department !== "Warehouse";
  const needsPhone = (e) => e.department === "Management" || e.department === "IT" || e.title === "Account manager";
  const needsDesk = (e) => ["Finance", "IT", "Management", "Customer service"].includes(e.department);
  const deviceOf = {};  // employee key -> list of assets
  const give = (e, a) => { (deviceOf[e.key] ??= []).push(a); };

  for (const e of employees) {
    if (e.key === "lugo") continue;  // left long ago; only the refreshed laptop above
    const leftLongAgo = e.left_offset !== null && e.left_offset < -200;
    if (needsLaptop(e) && !laptopOf[e.key] && !leftLongAgo && !handedDown.has(e.key)) {
      if (e.key === "mercado" || e.key === "nieves") {
        // new hires whose laptops are still on the way
        buy(e.key === "mercado" ? "latitude" : "thinkpad", e.started_offset - 2, locKey(e), { arrived: false });
      } else {
        const start = refreshDay[e.key] ?? e.started_offset;
        // a refreshed laptop is bought just before the old one comes back;
        // otherwise anywhere in the first part of the person's time here (some are old by now)
        // (three are pinned so their 3-year warranty ends in the next 90 days)
        const bought = WARRANTY_SOON[e.key] ?? (refreshDay[e.key] ? start - int(1, 7) : Math.max(start - int(2, 20), int(-1650, -60)));
        const a = buy(laptopFor(e), bought, locKey(e));
        deploy(a, Math.max(bought + int(1, 6), e.started_offset), e);
        laptopOf[e.key] = a;
      }
    }
    if (laptopOf[e.key] && !leftLongAgo) give(e, laptopOf[e.key]);
    if (leftLongAgo) continue;
    if (needsPhone(e)) {
      const bought = Math.max(e.started_offset, int(-1000, -100)) - int(1, 10);
      const a = buy(pick(["iphone", "iphone", "galaxy"]), bought, locKey(e));
      deploy(a, Math.max(bought + 1, e.started_offset), e);
      give(e, a);
    }
    if (needsDesk(e)) {
      for (let k = 0; k < (e.department === "IT" ? 2 : 1); k++) {
        const bought = Math.max(e.started_offset, -1900) - int(1, 15);
        const a = buy(pick(["p2425h", "e24"]), bought, locKey(e));
        deploy(a, Math.max(bought + 1, e.started_offset), e);
        give(e, a);
      }
      const d = buy("wd19", Math.max(e.started_offset, -1500) - int(1, 15), locKey(e));
      deploy(d, Math.max(d.purchased_offset + 1, e.started_offset), e);
      give(e, d);
    }
    if (e.department === "Warehouse") {
      const bought = Math.max(e.started_offset, -1200) - int(1, 15);
      const a = buy("et45", bought, "ponce");
      deploy(a, Math.max(bought + 1, e.started_offset), e);
      give(e, a);
    }
  }

  // ---- 4. people who left recently: what came back, and what didn't ----
  // still out with the person: Jose (laptop), Ricardo (laptop and monitor), Wilfredo (tablet), Megan (phone)
  const notReturned = { pabon: ["laptop"], feliciano: ["laptop", "monitor"], soto: ["tablet"], foster: ["phone"] };
  for (const k of ["pabon", "foster", "feliciano", "green", "soto", "marrero"]) {
    const e = emp[k];
    for (const a of deviceOf[k] ?? []) {
      if ((notReturned[k] ?? []).includes(a.category)) continue;
      handBack(a, e.left_offset + int(0, 3), e, "Left the company");
    }
  }

  // ---- 5. repairs, a lost phone ----
  const repairOut = (a, day, note) => ev(a, day, "repair_out", null, note);
  repairOut(laptopOf.nguyen, -9, "Keyboard not working; sent to Ceiba Office Supply depot");
  const ortegaPhone = deviceOf.ortega.find((a) => a.category === "phone");
  repairOut(ortegaPhone, -41, "Cracked screen; waiting on parts");
  // an older repair that finished: out, back, and re-issued to the same person
  ev(laptopOf.morales, -210, "repair_out", null, "Battery swelling");
  ev(laptopOf.morales, -198, "repair_back", null, "Battery replaced under warranty");
  deploy(laptopOf.morales, -197, emp.morales);
  const carterPhone = deviceOf.carter.find((a) => a.category === "phone");
  ev(carterPhone, -70, "lost", emp.carter, "Reported lost; remote-wiped from MDM");
  const newPhone = buy("iphone", -69, "houston");
  deploy(newPhone, -68, emp.carter, "Replacement for lost phone");

  // ---- 6. shared devices (no person), spares, and devices still on order ----
  const shared = [
    ["optiplex", -1300, "ponce", "Receiving dock PC"], ["optiplex", -700, "ponce", "Receiving dock PC 2"],
    ["optiplex", -260, "sanjuan", "Store counter PC"], ["zd421", -1100, "ponce", "Dock label printer"],
    ["zd421", -380, "ponce", "Dock label printer 2"], ["zd421", -540, "houston", "Shipping label printer"],
    ["laserjet", -900, "sanjuan", "Store office printer"], ["laserjet", -480, "houston", "Office printer"],
    ["p2425h", -620, "houston", "Meeting room screen"], ["e24", -615, "houston", "Meeting room screen 2"],
  ];
  for (const [m, bought, loc, note] of shared) {
    const a = buy(m, bought, loc);
    deploy(a, bought + int(1, 4), null, note);
  }
  // laptops and a phone handed out with nobody written down (a data-quality problem to fix)
  const loaner = buy("latitude", -330, "houston");
  deploy(loaner, -150, null, "Loaner; user not recorded");
  const noNamePhone = buy("galaxy", -210, "sanjuan");
  deploy(noNamePhone, -205, null);

  // spares in the IT closet
  for (const [m, bought, loc] of [["latitude", -95, "ponce"], ["elitebook", -40, "houston"], ["thinkpad", -400, "ponce"],
    ["iphone", -60, "houston"], ["galaxy", -150, "sanjuan"], ["p2425h", -88, "ponce"], ["e24", -300, "houston"], ["wd19", -120, "ponce"]]) {
    buy(m, bought, loc);
  }
  buy("p2425h", -2, "remote", { arrived: false });

  // ---- 7. health checks from deployed laptops and desktops ----
  // work out each asset's status from its events (same rule as the SQL view)
  const statusOf = (a) => {
    const evs = events.filter((x) => x.asset_id === a.asset_id);
    const last = evs.reduce((p, x) => (x.event_offset >= p.event_offset ? x : p));
    return last.event_type;
  };
  const checks = [];
  const deployedComputers = assets.filter((a) => (a.category === "laptop" || a.category === "desktop") && statusOf(a) === "deployed");
  // pick the devices with problems up front, so the dashboard always has some to show
  const lastDeployOf = (a) => Math.max(...events.filter((x) => x.asset_id === a.asset_id && x.event_type === "deployed").map((x) => x.event_offset));
  const settled = deployedComputers.filter((a) => a !== loaner && lastDeployOf(a) < -90);
  const stale = new Set(settled.slice(3, 6).map((a) => a.asset_id));                  // stopped checking in
  const never = new Set([loaner.asset_id]);                                           // never checked in
  const behind = new Set(settled.slice(10, 12).map((a) => a.asset_id));               // Windows updates piling up
  const noBitlocker = new Set(deployedComputers.filter((a) => !stale.has(a.asset_id) && !never.has(a.asset_id)).filter((_, i) => i % 9 === 4).map((a) => a.asset_id));
  const lowDisk = new Set(deployedComputers.filter((_, i) => i % 7 === 2).map((a) => a.asset_id));
  for (const a of deployedComputers) {
    if (never.has(a.asset_id)) continue;
    const isMac = models.find((m) => m.model_id === a.model_id).manufacturer === "Apple";
    const deployedOn = lastDeployOf(a);
    const lastDay = stale.has(a.asset_id) ? -int(32, 60) : -int(1, 2);
    let freePct = 20 + rand() * 55;
    for (let day = Math.max(deployedOn + 1, -84 + int(0, 3)); day <= lastDay; day += int(6, 8)) {
      freePct = Math.max(3, freePct - rand() * 1.5);
      checks.push({
        asset_id: a.asset_id, checked_offset: day,
        os_version: isMac ? pick(["macOS 15.6", "macOS 15.7"]) : pick(["Windows 11 Pro 24H2", "Windows 11 Pro 24H2", "Windows 11 Pro 23H2"]),
        bitlocker_on: !(noBitlocker.has(a.asset_id) && day > -30),
        disk_free_pct: Math.round((lowDisk.has(a.asset_id) ? Math.min(freePct, 6 + rand() * 7) : freePct) * 10) / 10,
        pending_updates: behind.has(a.asset_id) && day > -25 ? int(7, 14) : rand() < 0.15 ? int(6, 9) : int(0, 3),
      });
    }
    // make sure the last check exists exactly on lastDay so "days since" is predictable
    if (!checks.some((c) => c.asset_id === a.asset_id && c.checked_offset === lastDay) && lastDay > deployedOn) {
      checks.push({ asset_id: a.asset_id, checked_offset: lastDay, os_version: isMac ? "macOS 15.7" : "Windows 11 Pro 24H2",
        bitlocker_on: !noBitlocker.has(a.asset_id), disk_free_pct: Math.round((lowDisk.has(a.asset_id) ? Math.min(freePct, 6 + rand() * 7) : freePct) * 10) / 10,
        pending_updates: behind.has(a.asset_id) ? 11 : int(0, 2) });
    }
  }
  checks.sort((x, y) => x.asset_id - y.asset_id || x.checked_offset - y.checked_offset);
  checks.forEach((c, i) => { c.check_id = i + 1; });

  // ---- 8. software seats ----
  const licenses = LICENSES.map(([product, vendor, seats, cost, renews], i) => ({
    license_id: i + 1, product, vendor, seats_owned: Number(seats), cost_per_seat_year: Number(cost), renews_offset: Number(renews),
  }));
  const seats = [];
  const seat = (licenseId, e) => seats.push({ license_id: licenseId, employee_id: e.employee_id, assigned_offset: Math.max(e.started_offset, -900) });
  // who still has a seat after leaving (should have been removed)
  const keptSeats = { pabon: [1, 3], foster: [1, 4], feliciano: [1, 2], green: [5], soto: [1] };
  for (const e of employees) {
    const left = e.left_offset !== null;
    const wants = (id) => (left ? (keptSeats[e.key] ?? []).includes(id) : true);
    if (wants(1)) seat(1, e);                                                                          // everyone gets Microsoft 365
    if (e.department !== "Warehouse" && e.department !== "Receiving" && wants(2)) seat(2, e);         // password manager for office staff
    if (["Sales", "Customer service", "IT", "Management"].includes(e.department) && wants(3)) seat(3, e);
    if ((e.department === "Management" || e.title === "Account manager" || e.department === "IT") && wants(4)) seat(4, e);
    if ((e.department === "Finance" || e.department === "Management") && wants(5)) seat(5, e);
  }

  events.sort((x, y) => x.asset_id - y.asset_id || x.event_offset - y.event_offset);
  events.forEach((x, i) => { x.event_id = i + 1; });

  return { locations, employees, models, assets, events, checks, licenses, seats };
}
