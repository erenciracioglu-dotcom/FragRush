# FragRush — Break, Blast, Bury

**A fast, fully destructible arena shooter that runs in your browser.**
Jump in, no accounts, no setup: fight bots in a neon-lit voxel arena, a sunny meadow of
treehouses, a creek and a lake, or a dark volcanic valley cut by a creek of lava, where almost every
wall, tree and bridge can be blown apart and whatever collapses buries whoever stands below.

**▶ Play now: https://erenciracioglu-dotcom.github.io/FragRush/**

![FragRush](media/hero.jpg)

In the spirit of Quake 3 and Unreal Tournament: free-for-all deathmatch against bots, instant
respawn, rocket jumps, bunny hops and dashes. Hiding doesn't work for long, because cover doesn't
last.

| | |
|---|---|
| ![Collapse](media/collapse.jpg) | ![Blast](media/blast.jpg) |

## How to play

| Key | Action |
|---|---|
| WASD | move |
| Space | jump (hold to bunny hop); in deep water: swim up, hold at the surface to tread water |
| Shift | dash |
| C | crouch, slide while running; in deep water: dive |
| Left click | fire |
| Right click | zoom (railgun) |
| 1-5 / wheel / Q | select weapon / previous weapon |
| Tab | scoreboard |
| Esc / P | menu (pause; *Leave match* returns to the main menu); in menus: back, on the main menu: resume |
| Enter | play / resume |
| F3 | FPS and performance overlay |

**Rocket jump:** fire a rocket at your feet and jump at the same moment.

First to 25 frags (or the leader after 10 minutes) wins, then a fresh arena is generated.

Ctrl is not bound to anything: in Chrome, Ctrl+W closes the tab (crouch used to be on Ctrl too).

## Maps

Pick the map on the main menu: **MEADOW**, **VOLCANO**, **ARENA** or **ROTATE** (changes after every
match: meadow, volcano, arena, ...). *NEW ARENA* rebuilds the chosen map with a new layout seed.
URL override for testing: `?map=meadow`, `?map=volcano` or `?map=arena`.

- **Arena**: the original neon sunset arena: central tower, four forts, bridges, corner yards.
- **Meadow**: a sunny afternoon in a valley ringed by cliffs. A great oak in the middle carries a
  wide treehouse deck and, at the very top, the lookout where the Doomsday Orb appears (four jump
  pads, or a rocket jump). Three more treehouses (lookout, creek house, lake house) hang on big
  trees and are joined to the oak by plank bridges; every treehouse has a spiral staircase and a
  jump pad. A creek springs from a cave in the west cliff and winds into a small lake; there is a
  dock, a diving board from the lake house, footbridges, a hunter's stand, boulders, logs and
  bushes. Everything is voxels and breaks: cut a trunk and the crown (and whoever is in the
  treehouse) comes down. Only the cliff core and the bedrock are indestructible.

| | |
|---|---|
| ![Meadow](media/meadow.jpg) | ![Creek](media/meadow_creek.jpg) |
| ![Waterline](media/meadow_waterline.jpg) | ![Underwater](media/meadow_underwater.jpg) |

- **Volcano**: the meadow's dark twin, at night under a sky of ash with a volcano erupting on the
  horizon. No trees: an obsidian spire stands in the middle with a wide stone deck and, at the very
  top, the lookout ring where the Doomsday Orb appears (four jump pads, or a rocket jump). Three
  basalt towers with stone huts and spiral staircases are joined to the spire by iron grate bridges,
  each with its own jump pad, and a watch hut stands on basalt legs. A narrow creek of lava runs
  from a cave in the west cliff into a small, shallow lava pond (together a little under a third of
  the meadow's water surface); three natural basalt arches cross the creek. The Mega Health waits on
  a basalt islet in the middle of the pond: two obsidian stepping stones lead there, one careless
  jump and you burn. Obsidian crystals, basalt column fields, glowing magma cracks, steaming vents
  and braziers fill the valley; embers drift and ash falls. Everything breaks except the cliff core
  and the bedrock.

| | |
|---|---|
| ![Volcano](media/volcano.jpg) | ![Lava creek](media/volcano_creek.jpg) |
| ![Lava pond](media/volcano_pond.jpg) | ![From the bridge](media/volcano_bridge.jpg) |

### Water (meadow)

Every empty voxel below the water level is water: the creek, the lake, and any crater you blast
down to that depth. The water you see and the water you move through are the same.

- **Creek** (about 0.5 m deep): you wade, slower the deeper you are (about 60 % of running speed),
  jumps and dashes are weaker. You can still shoot.
- **Lake** (up to about 3 m): you swim at about 40 % of running speed, in the direction you look.
  You slowly sink unless you hold **Space**; holding Space at the surface keeps your head above
  water. **C** dives. Swim into the shore near the surface to climb out (banks up to 1 m), or walk
  out on the shallow beaches.
- **Head under water: no shooting.** The weapon is lowered and the crosshair dims.
- **Air:** 12 seconds (the AIR meter appears under the crosshair). After that you take damage every
  second (10, 15, 20, ... ignores armor). Drowning is a **self frag (−1)**. Surfacing refills the
  air at once.
- The **Mega Health** lies at the bottom of the lake: dive for it, but you can't shoot down there.
- Rockets that explode in or near the water raise a water column with rings, a flash and a gas
  bubble seen from below; bullets and projectiles splash where they cross the surface. Underwater
  the sound is muffled. Surfacing leaves drops and a draining film on the lens.
- Bots wade the creek, avoid deep water, never fire while submerged and swim back to the nearest
  shore if they end up in the lake. They ignore the Mega Health on the lake bottom.

### Lava (volcano)

Every empty voxel below the lava level in the creek, the pond and right next to them is lava: blast
a crater that deep within about a meter of the lava and it fills with lava; craters further away
stay dry. The lava you see is the lava that kills.

- **Touching lava kills instantly**, armor or not. Fall in on your own and it counts as a
  **self frag (−1)**.
- **Push someone in and the frag is yours** ("INTO THE LAVA!"): whoever hit them in the last
  4 seconds, with a rocket blast or anything else, gets the credit.
- The lava lights the banks around it, embers rise from it, bubbles pop and you can hear it rumble
  when you get close.
- Bullets stop at the surface, rockets and plasma bolts explode on it with a splash of lava, rail
  shots splash through. Items that fall in burn and come back at their spot later; debris melts.
- Bots keep away from the edge: they don't run, jump or dash toward the lava, brake when their
  momentum would carry them in, and cross on the arches and bridges. They ignore the Mega Health on
  the islet. They can still be blasted in.

### Weapons

1. **Pulse Rifle**: rapid fire, slowly carves through walls
2. **Shotgun**: close range, shreds cover
3. **Plasma Gun**: fast bolts with small blasts, great for drilling concrete
4. **Rocket Launcher**: big craters, brings structures down, rocket jumps
5. **Railgun**: pierces up to 14 m of wall and hits whoever is behind it

### Doomsday Orb

Spawns on the roof of the central tower, reachable only with jump pads or a rocket jump.
For **15 seconds every hit kills**: every pulse bolt, every shotgun pellet, every plasma bolt,
every rail. Rocket blasts become **5× larger** (≈12 m craters, ≈21 m damage radius). Your own
blasts throw you around but don't hurt you.

### No camping

- Bots hear gunfire, come to where you were last seen and blast through the cover between you.
- Stay in the same small area for more than 15 seconds and **your position is revealed**: the
  three nearest bots learn where you are and come to break your cover (you get a warning at 10 s).
- Walls, columns and bridges break. Anything that loses its connection to the ground collapses
  and crushes what is below. Bring a ceiling down on an enemy and the frag is yours
  ("BURIED IN RUBBLE").

### Settings

Map (main menu), language (English / Türkçe), mouse sensitivity, field of view, graphics quality
(Ultra / High / Medium / Low), bot count (0-11, can be changed mid-match), bot difficulty
(7 levels from Rookie to Nightmare), volume, invert mouse, FPS overlay.
Three of the bots are family: **Papa Eren**, **Eray the Kid** and **Mama Aigul**.

![Bots](media/bots.jpg)

## Requirements

- A desktop browser with **WebGL 2**. Chrome or Edge recommended (tested in Chrome).
- Mouse and keyboard. Mobile is not supported.
- A dedicated GPU is recommended. Unless you pick a quality yourself, the game starts on **Low**
  on integrated graphics, **Medium** on older dedicated GPUs and **High** on RTX / Radeon RX 5000+
  class GPUs; change it in Settings (press F3 to see FPS).
- The first match shows a short controls card (H hides it; it appears only once).
- No install, no downloads. The online version counts anonymous visits with
  [GoatCounter](https://www.goatcounter.com) (no cookies, no personal data); local copies don't.
- No other network use after the page has loaded (everything, including all sound,
  is generated in the browser).

**If the picture freezes every few seconds, update your graphics driver.** On the test laptop
(Intel integrated graphics + RTX 5080), Intel driver 32.0.101.6629 (February 2025) froze the
picture for 0.3–0.8 s every 6 seconds whenever anything was animating: the game, a page with
nothing but a CSS animation, and a small native Direct3D test program alike. Intel driver
32.0.101.9150 (October 2026) fixed it.

**Laptops:** if the game runs slowly, the browser is probably on the integrated GPU (the menu
shows a warning when it is). On Windows, set the browser to "High performance" in
*Settings → System → Display → Graphics* and restart the browser, or use the launcher below.
Laptops with a MUX switch can also be set to "dGPU only".

## Run locally

The whole game is a single file: `docs/index.html`. You can open it directly in Chrome.

**Windows launcher:** `FragRush.bat` starts a small local server (if [Node.js](https://nodejs.org)
is installed) and opens the game in a separate fullscreen Chrome window on the high-performance GPU.
The server closes itself about 45 s after the game window is closed.

**From source:**

```
npm install
node build.mjs      # builds dist/index.html and docs/index.html
node serve.mjs      # http://127.0.0.1:8777/
```

## Performance

Measured on an RTX 5080 Laptop at 2560×1362, Ultra:

- ~240 FPS average, 99th percentile frame time 8 ms.
- 30 seconds of non-stop Doomsday rockets (one per second, the arena almost completely leveled,
  ~380k voxels removed): worst frame 12 ms, no frame over 20 ms.
- 5-minute heavy-destruction soak tests: stable memory (no leaks), no shader compiles during play.
- On most hybrid-graphics laptops the built-in screen is driven by the integrated GPU even when the
  game renders on the dedicated one, so keep the integrated GPU's driver up to date as well.
  "dGPU only" (MUX) mode takes the integrated GPU out of that path.

Benchmark page: `?bench=30&q=ultra` (local server, writes results to `reports/`), add `&map=meadow`
or `&map=volcano` for the other maps.

The meadow is heavier than the arena (more triangles in trees and grassy slopes, plus water). On the
test laptop's **integrated** GPU (Intel Graphics 0x7D67, Chrome/ANGLE D3D11, Low quality, 1104×561,
25 s bot-following benchmark with large blasts): arena ~207 FPS (GPU 4.2 ms/frame), meadow ~134 FPS
(GPU 6.4 ms/frame). Measured at fixed views with GPU timer queries, the water (per-frame wave/foam
updates + drawing) costs about 0.9 ms per frame at Low on that GPU, and drawing it about 1.1 ms at
High (1578×802). The underwater and lens passes run only when the camera is at or below the
waterline or the lens is wet, and ambient occlusion is switched off while fully underwater.

The volcano sits between the two: it has no trees but adds the lava surface, its glow on the voxels
and embers. Run back to back on the same integrated GPU at Low in a larger window (1563×831), the
arena averaged 122 FPS (GPU 7.7 ms/frame), the volcano 101 FPS (9.4 ms) and the meadow 86 FPS
(11.0 ms).

## How it works

- **Three.js r186 + WebGL 2**, bundled with esbuild into one self-contained HTML file (~1 MB).
- **Voxel world**: 72 × 24 × 72 m at 25 cm resolution (~8 million cells). Each material has its own
  toughness and per-voxel damage: concrete cracks and darkens before it breaks, steel holds longer,
  wood and glass break easily. Bedrock and the outer frame are indestructible.
- **Meshing**: greedy meshing with per-vertex ambient occlusion in 6 Web Workers. Changed chunks are
  re-meshed nearest-to-camera first; GPU buffers are allocated with headroom and updated in place,
  and new allocations are spread over frames so huge blasts don't stall the driver.
- **Structural integrity**: after each blast, islands that lost their connection to the ground are
  found with a downward-biased flood fill (~2 ms), fall as rigid bodies and break into debris and
  rubble on impact.
- **Rendering**: sunset sky and environment map, 4K shadow map, N8AO ambient occlusion, bloom, AgX
  tone mapping, color grading, SMAA, per-voxel color variation, bevels and material patterns,
  instanced particles and debris, a fixed-size dynamic light pool (no shader recompiles).
  All shaders are compiled up front.
- **Bots**: multi-level navigation grid that updates as the arena is destroyed, A* pathfinding,
  target selection, strafing, jumping, dashing, rocket dodging, jump pads. When stuck they drill
  through walls. Near lava they trace where their run, jump or dash would end (steps, drops, the
  arc of a jump) and brake or turn away before it ends in the lava.
- **Audio**: fully synthesized with WebAudio at runtime (no sound files), 3D positioned with reverb.
- **Water (meadow)**: [water.js](src/vendor/water.js) (our own WebGL2 water library, vendored as
  one file) drawn inside the Three.js post-processing chain with raw WebGL calls: the surface is
  drawn after AO with refraction from a half-resolution copy of the scene, a creek flow map and
  interactive ripples; an underwater pass (only when the camera is at or below the waterline)
  applies water absorption, scattering, caustics and the explosion flash to the scene from the depth
  buffer; a lens pass adds drops and the waterline. water.js's physical sky is converted once into a
  Three.js cube map for the background and the lighting environment, so the sky, the reflections in
  the water and the lighting of the voxels match.
- **Lava (volcano)**: one rule everywhere: an empty voxel below the lava level inside the lava area
  (creek and pond plus a 1.25 m margin) is lava. Drawing, the kill check, bullets, projectiles,
  items, debris and the bots' navigation all use it. The surface is a flat mesh over that area with
  its own shader (a crust of moving cells with glowing cracks, carried along a flow map, cooler at
  the banks); a low-resolution proximity map lights nearby voxels from below. The night sky (ash
  clouds, the distant volcano with lava streaks and a glowing plume) is a shader, also baked into
  the environment map for reflections. The lava's rumble, bubbles and sizzle are synthesized too.

```
src/            source (src/config.js: all tunables in one place)
  world/        voxel world, materials, mesher (+ worker), map generators (arena, meadow, volcano), levels, voxel shader
  game/         game loop, movement (incl. swimming), weapons, bots, destruction, items, navigation
  fx/           sky, post-processing, water bridge, lava, environments, particles, debris, lights
  vendor/       water.js
  audio/ ui/    sound synthesis, HUD
docs/           built single-file game (served by GitHub Pages)
serve.mjs       dependency-free local server
build.mjs       build script
test/           headless tests (movement, world, water, meadow, volcano, flows, screenshots)
tools/          benchmark scripts
```

## Status

Proof of concept, built with Claude. Bots only, no multiplayer (yet). Water does not flow: blasting
a lake bank does not drain the lake, and a deep crater anywhere fills with water from the water table.
Lava does not flow either: where it can be is fixed when the map is built. Weapon models and robots are
simple procedural boxes. Very large structures (over 160k voxels) are treated as fixed and don't fall.
Sound starts after the first click (browser rule).

---

## Türkçe

**FragRush**, tarayıcıda çalışan, neredeyse her şeyin parçalanabildiği hızlı bir arena FPS'i.
Hesap yok, kurulum yok: gir, neon ışıklı voxel arenada botlarla kapış, duvarları, kolonları,
köprüleri havaya uçur, çöken binaların altında rakiplerini göm.

**▶ Hemen oyna: https://erenciracioglu-dotcom.github.io/FragRush/**

- Quake 3 / Unreal Tournament ruhu: herkes herkese karşı, ölünce anında yeniden doğuş, roketle
  zıplama, tavşan zıplaması, atılma. 25 parçalamaya ulaşan (ya da 10 dakika sonunda önde olan)
  kazanır, ardından yeni bir arena kurulur.
- **Dil:** oyun İngilizce açılır; *SETTINGS → Language* ile Türkçeye geçilir (seçim hatırlanır).
- **Haritalar:** ana menüde **ÇAYIR**, **VOLKAN**, **ARENA** ya da **SIRAYLA** (her maçtan sonra
  değişir). Çayır: uçurumlarla çevrili güneşli bir vadi; ortada tepesinde KIYAMET küresinin çıktığı
  gözetleme yeri olan büyük bir meşe ve ağaç evi, köprülerle bağlı üç ağaç evi daha, uçurumdaki
  mağaradan çıkıp küçük bir göle akan dere, iskele, atlama tahtası, avcı kulübesi. Ağacı kesersen
  tacı (ve ağaç evindeki) aşağı iner.
  Volkan: çayırın karanlık ikizi; gece, kül bulutlarının altında, ufukta patlayan bir volkan. Ağaç
  yok: ortada tepesinde KIYAMET küresinin çıktığı gözetleme halkası olan obsidyen kule, demir ızgara
  köprülerle bağlı üç bazalt kule ve taş kulübeler, bazalt ayaklı gözcü kulübesi; batı uçurumundaki
  mağaradan çıkıp küçük, sığ bir lav göletine akan dar bir lav deresi ve üstünde üç bazalt kemer.
  Mega can göletin ortasındaki bazalt adacıkta (iki obsidyen basamak taşı, dikkatsiz bir atlayış
  ve yanarsın). Obsidyen kristalleri, bazalt sütunları, akkor magma çatlakları, duman tüten fümeroller.
- **Su:** derede yavaşlarsın ama ateş edebilirsin. Gölde yüzersin: Boşluk yukarı (yüzeyde basılı
  tutunca başın suyun üstünde kalır), **C** dalış; tuşa basmazsan yavaşça batarsın. **Başın su
  altındayken ateş edemezsin.** 12 saniye nefesin var; sonra her saniye artan hasar alırsın (zırhı
  deler) ve boğulursan **kendini parçalamış sayılırsın (−1)**. Mega can gölün dibinde.
- **Lav:** dokunan anında ölür, zırh fark etmez. Kendin düşersen **kendini parçalamış sayılırsın
  (−1)**; son 4 saniyede birini vurup lava ittiysen parçalama senin (**LAVA DÜŞÜRDÜN!**). Lavın bir
  metre yakınında lav seviyesine kadar inen krater lavla dolar. Mermiler yüzeyde durur, roket ve
  plazma yüzeyde patlar; lava düşen eşya yanar ve bir süre sonra yerinde yeniden çıkar. Botlar lav
  kenarından uzak durur, lava doğru koşmaz, zıplamaz, atılmaz; ama patlamayla lava itilebilirler.
- **Ctrl tuşu kullanılmıyor:** Chrome'da Ctrl+W sekmeyi kapatıyor; eğilme yalnızca **C**.
- **Silahlar:** Darbe Tüfeği, Saçmalı, Plazma, Roketatar, Raylı Tüfek (duvarın arkasını vurur).
- **KIYAMET küresi:** merkez kulenin çatısında çıkar. 15 saniye boyunca her isabet öldürür,
  roket patlamaları 5 kat büyür. Kendi patlaman sana hasar vermez.
- **Saklanmak işe yaramaz:** botlar silah sesini duyar ve siperi deler; 15 saniyeden uzun aynı
  yerde kalırsan konumun açığa çıkar. Bağlantısı kopan yapılar çöker ve altındakini ezer.
- **Ayarlar:** dil, fare hassasiyeti, görüş alanı, grafik kalitesi, bot sayısı (0-11, maç
  sırasında da değişir), 7 kademe bot zorluğu (Acemi'den Kâbus'a), ses. Botlardan üçü aile:
  Papa Eren, Eray the Kid ve Mama Aigul.
- **Gereksinim:** WebGL 2 destekli masaüstü tarayıcı (Chrome / Edge önerilir), fare ve klavye.
  Harici ekran kartı önerilir. **Görüntü birkaç saniyede bir donuyorsa ekran kartı sürücünü
  güncelle:** test dizüstünde Intel sürücüsü 32.0.101.6629 (Şubat 2025), oyundan bağımsız olarak
  (yalnız CSS animasyonlu bir sayfada ve yalın bir Direct3D programında da) her 6 saniyede bir
  görüntüyü 0,3-0,8 saniye durduruyordu; 32.0.101.9150 (Ekim 2026) bunu düzeltti. Dizüstünde
  yavaşsa tarayıcı dahili ekran kartında çalışıyordur (menüde uyarı çıkar): Windows *Ayarlar →
  Sistem → Ekran → Grafik* bölümünden tarayıcıyı "Yüksek performans"a al ve tarayıcıyı kapatıp
  yeniden aç.
- **Yerelde:** `docs/index.html` tek dosyadır, doğrudan açılabilir. Windows'ta `FragRush.bat`
  yerel sunucuyu açar ve oyunu ayrı, tam ekran bir Chrome penceresinde harici ekran kartıyla başlatır.
  Kaynaktan derlemek için `npm install` ve `node build.mjs`.

## License

- **Code:** [PolyForm Noncommercial 1.0.0](LICENSE). You may read, run, learn from, modify and share
  the code for **noncommercial** purposes. Commercial use, including re-hosting the game on ad-supported
  sites or portals, is not permitted. For a commercial license, open an issue or contact the author.
- **Name, screenshots and other media** (`media/`, the "FragRush" name): all rights reserved.
- **Third-party libraries** (three.js, postprocessing, n8ao) keep their own licenses, see
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- Versions published before 26 October 2026 were released under the MIT License; that grant still
  applies to those earlier versions only.

**Türkçe:** Kod PolyForm Noncommercial 1.0.0 lisanslıdır: ticari olmayan amaçla okunabilir, çalıştırılabilir,
değiştirilip paylaşılabilir; reklamlı sitelerde veya portallarda yeniden yayın dahil ticari kullanım yasaktır.
Ad, ekran görüntüleri ve diğer medya için tüm hakları saklıdır.
