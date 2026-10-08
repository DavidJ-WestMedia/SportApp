(function(){
  "use strict";
  // Self-contained multi-admin login. Client-side only — a casual deterrent,
  // not real security (visible/bypassable to anyone inspecting the page).
  // Each admin is {id, name, passwordHash}. There is no password reset by
  // design: a locked-out admin has to be removed and re-added by another
  // admin from inside the app.
  var ADMINS_KEY = 'bracket_room_admins_v1';

  var gateForm = document.getElementById('gateForm');
  var setupFields = document.getElementById('gateSetupFields');
  var loginFields = document.getElementById('gateLoginFields');
  var setupName = document.getElementById('gateSetupName');
  var setupPassword = document.getElementById('gateSetupPassword');
  var setupConfirm = document.getElementById('gateSetupConfirm');
  var loginAdminSelect = document.getElementById('gateLoginAdmin');
  var loginPassword = document.getElementById('gateLoginPassword');
  var errorEl = document.getElementById('gateError');
  var submitBtn = document.getElementById('gateSubmitBtn');

  var adminMenuWrap = document.getElementById('adminMenuWrap');
  var adminMenuBtn = document.getElementById('adminMenuBtn');
  var adminMenuName = document.getElementById('adminMenuName');
  var adminMenuDropdown = document.getElementById('adminMenuDropdown');
  var adminMenuList = document.getElementById('adminMenuList');
  var adminMenuAddToggle = document.getElementById('adminMenuAddToggle');
  var adminAddForm = document.getElementById('adminAddForm');
  var newAdminName = document.getElementById('newAdminName');
  var newAdminPassword = document.getElementById('newAdminPassword');
  var newAdminConfirm = document.getElementById('newAdminConfirm');
  var adminAddError = document.getElementById('adminAddError');
  var adminAddSubmitBtn = document.getElementById('adminAddSubmitBtn');
  var adminMenuLogoutBtn = document.getElementById('adminMenuLogoutBtn');

  var isPresentLink = location.hash === '#present' || location.hash === '#present-live';
  if(isPresentLink){
    // A present/view-only link is meant to be shared — requiring an admin
    // login here would defeat that, and the page is already locked
    // read-only regardless, so skip the gate for this specific entry point.
    document.body.classList.add('unlocked');
    adminMenuWrap.style.display = 'none';
    return;
  }

  var storageAvailable = false;
  try{
    window.localStorage.setItem('__gate_test__','1');
    window.localStorage.removeItem('__gate_test__');
    storageAvailable = true;
  }catch(e){ storageAvailable = false; }

  if(!storageAvailable){
    // No persistent storage here (e.g. a sandboxed preview) — admin accounts
    // couldn't be remembered between loads anyway, so skip the gate.
    document.body.classList.add('unlocked');
    adminMenuWrap.style.display = 'none';
    return;
  }

  function hashPassword(pw){
    if(window.crypto && window.crypto.subtle){
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw))
        .then(function(buf){
          return 'sha256:' + Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
        })
        .catch(function(){ return simpleHash(pw); });
    }
    return Promise.resolve(simpleHash(pw));
  }
  function simpleHash(pw){
    var hash = 0;
    for(var i=0; i<pw.length; i++){ hash = ((hash<<5)-hash + pw.charCodeAt(i)) | 0; }
    return 'simple:' + hash;
  }

  function loadAdmins(){
    try{
      var raw = localStorage.getItem(ADMINS_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){ return []; }
  }
  function saveAdmins(list){
    try{ localStorage.setItem(ADMINS_KEY, JSON.stringify(list)); }catch(e){}
  }

  var admins = loadAdmins();
  var currentAdmin = null; // {id, name} while logged in this session
  var adminUid = admins.reduce(function(max, a){
    var n = parseInt(String(a.id).replace('a',''), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0) + 1;

  // ---------- Gate: setup (no admins yet) vs login (admins exist) ----------
  function renderGate(){
    admins = loadAdmins();
    if(admins.length === 0){
      setupFields.style.display = '';
      loginFields.style.display = 'none';
      submitBtn.textContent = 'Create admin';
      setupName.focus();
    } else {
      setupFields.style.display = 'none';
      loginFields.style.display = '';
      loginAdminSelect.innerHTML = admins.map(function(a){
        return '<option value="'+a.id+'">'+escapeHtmlGate(a.name)+'</option>';
      }).join('');
      submitBtn.textContent = 'Log in';
      loginPassword.value = '';
      loginPassword.focus();
    }
    errorEl.textContent = '';
  }
  function escapeHtmlGate(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  renderGate();

  gateForm.addEventListener('submit', function(e){
    e.preventDefault();
    errorEl.textContent = '';

    if(admins.length === 0){
      var name = setupName.value.trim();
      var pw = setupPassword.value;
      if(!name){ errorEl.textContent = 'Enter a name.'; return; }
      if(!pw){ errorEl.textContent = 'Enter a password.'; return; }
      if(pw !== setupConfirm.value){ errorEl.textContent = "Passwords don't match."; return; }
      hashPassword(pw).then(function(h){
        var admin = { id: 'a'+(adminUid++), name: name, passwordHash: h };
        admins = [admin];
        saveAdmins(admins);
        currentAdmin = { id: admin.id, name: admin.name };
        unlock();
      });
    } else {
      var adminId = loginAdminSelect.value;
      var pw2 = loginPassword.value;
      if(!pw2){ errorEl.textContent = 'Enter a password.'; return; }
      var match = admins.filter(function(a){ return a.id === adminId; })[0];
      if(!match){ errorEl.textContent = 'Pick an admin.'; return; }
      hashPassword(pw2).then(function(h){
        if(h === match.passwordHash){
          currentAdmin = { id: match.id, name: match.name };
          unlock();
        } else {
          errorEl.textContent = 'Incorrect password.';
          loginPassword.value = '';
          loginPassword.focus();
        }
      });
    }
  });

  function unlock(){
    document.body.classList.add('unlocked');
    renderAdminMenu();
  }

  // ---------- Admin menu (post-login): who's logged in, add/remove admins, log out ----------
  function renderAdminMenu(){
    adminMenuName.textContent = currentAdmin ? currentAdmin.name : 'Admin';
    admins = loadAdmins();
    adminMenuList.innerHTML = admins.map(function(a){
      var isYou = currentAdmin && a.id === currentAdmin.id;
      return '<div class="admin-menu-row">' +
          '<span>'+escapeHtmlGate(a.name)+(isYou ? '<span class="you-tag">YOU</span>' : '')+'</span>' +
          (admins.length > 1 ? '<button type="button" class="btn-danger-text" data-remove-admin="'+a.id+'">Remove</button>' : '') +
        '</div>';
    }).join('');
    adminMenuList.querySelectorAll('[data-remove-admin]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.dataset.removeAdmin;
        if(btn.dataset.confirming === '1'){
          admins = admins.filter(function(a){ return a.id !== id; });
          saveAdmins(admins);
          if(currentAdmin && currentAdmin.id === id){ location.reload(); return; }
          renderAdminMenu();
          return;
        }
        btn.dataset.confirming = '1';
        btn.textContent = 'Confirm?';
        setTimeout(function(){ delete btn.dataset.confirming; btn.textContent = 'Remove'; }, 3000);
      });
    });
  }

  adminMenuBtn.addEventListener('click', function(e){
    e.stopPropagation();
    var isOpen = adminMenuDropdown.style.display !== 'none';
    adminMenuDropdown.style.display = isOpen ? 'none' : '';
    if(!isOpen) renderAdminMenu();
  });
  document.addEventListener('click', function(e){
    if(!adminMenuWrap.contains(e.target)){
      adminMenuDropdown.style.display = 'none';
      adminAddForm.style.display = 'none';
    }
  });

  adminMenuAddToggle.addEventListener('click', function(){
    var isOpen = adminAddForm.style.display !== 'none';
    adminAddForm.style.display = isOpen ? 'none' : '';
    adminAddError.textContent = '';
    newAdminName.value = ''; newAdminPassword.value = ''; newAdminConfirm.value = '';
    if(!isOpen) newAdminName.focus();
  });

  adminAddSubmitBtn.addEventListener('click', function(){
    var name = newAdminName.value.trim();
    var pw = newAdminPassword.value;
    adminAddError.textContent = '';
    if(!name){ adminAddError.textContent = 'Enter a name.'; return; }
    if(!pw){ adminAddError.textContent = 'Enter a password.'; return; }
    if(pw !== newAdminConfirm.value){ adminAddError.textContent = "Passwords don't match."; return; }
    hashPassword(pw).then(function(h){
      admins = loadAdmins();
      admins.push({ id: 'a'+(adminUid++), name: name, passwordHash: h });
      saveAdmins(admins);
      adminAddForm.style.display = 'none';
      renderAdminMenu();
    });
  });

  adminMenuLogoutBtn.addEventListener('click', function(){
    location.reload();
  });
})();

(function(){
  "use strict";

  var PALETTE = ["#ffb627","#23d3ab","#ff5d6c","#5aa9ff","#c792ea","#ff9f5a","#7ee8b8","#f47cc1"];

  var state = {
    name: "Summer Cup",
    matchTimeLimit: "",
    profiles: [], // {id, name, color, chessUsername, epicUsername}
    game: "general", // 'general' | 'fortnite' | 'chess'
    format: "elim", // 'elim' | 'rr' | 'br'
    teams: [], // {id,name,host,color}
    rounds: [], // for elim: [[{a,b,scoreA,scoreB,winner}]]
    rrMatches: [], // for round robin: [{a,b,scoreA,scoreB}]
    brGames: [], // for battle royale: [{id, entries:{teamId:{placement,elims}}}]
    brElimPoints: 1, // points per elimination
    watchUsers: [], // [{id, username}] tracked chess.com players
    trackTC: { base: 600, increment: 0, sinceTs: null },
    fortniteApiKey: "",
    fortniteUsers: [], // [{id, username}] tracked Epic usernames
    fortniteSessions: {
      build: { label: "Build", baselineHistory: [], timeWindow: { startTs: null, endTs: null } },
      nobuild: { label: "No Build", baselineHistory: [], timeWindow: { startTs: null, endTs: null } }
    },
    fortniteActiveSession: "build",
    fortnitePoints: { perKill: 1, perWin: 5 },
    fortniteModeFilter: "all", // 'all' | 'solo' | 'duo' | 'trio' | 'squad'
    fortniteOverrides: {}, // segmentKey -> manual override record
    view: "main",
    started: false
  };

  var uid = 1;
  var toastTimer = null;
  function showToast(msg, isError){
    el.toast.textContent = msg;
    el.toast.className = 'toast show' + (isError ? ' error' : '');
    if(toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ el.toast.className = 'toast'; }, 4000);
  }

  // Non-blocking replacement for confirm(): first click arms it and relabels
  // the button; a second click within 3s actually runs the action.
  function confirmOnClick(btnEl, actionFn, confirmLabel){
    if(btnEl.dataset.confirming === '1'){
      clearTimeout(btnEl._confirmTimer);
      delete btnEl.dataset.confirming;
      btnEl.textContent = btnEl.dataset.originalText;
      actionFn();
      return;
    }
    btnEl.dataset.originalText = btnEl.textContent;
    btnEl.dataset.confirming = '1';
    btnEl.textContent = confirmLabel || 'Click again to confirm';
    btnEl._confirmTimer = setTimeout(function(){
      if(btnEl.dataset.confirming === '1'){
        delete btnEl.dataset.confirming;
        btnEl.textContent = btnEl.dataset.originalText;
      }
    }, 3000);
  }
  var forcedPresentView = null; // set to 'live' when this tab was opened specifically to present Scores
  function nextId(){ return "t" + (uid++); }
  var profileUid = 1;
  var selectedProfileColor = PALETTE[1];
  var openProfileMenuId = null;
  var editingProfile = null; // draft copy: {id, name, chessUsername, epicUsername, color, photo}
  var pendingProfilePhoto = null; // data URL for the Add Profile form, until submitted
  var brGameUid = 1;
  var chessUserUid = 1;
  var fnUserUid = 1;
  var tcCache = {}; // username(lowercase) -> { games, loading, error }
  var fortniteCache = {}; // username(lowercase) -> { loading, error, stats }
  var autoRefreshTimer = null;
  var fnAutoRefreshTimer = null;
  var selectedColor = PALETTE[0];

  // ---------- DOM refs ----------
  var el = {
    tourneyName: document.getElementById('tourneyName'),
    matchTimeLimit: document.getElementById('matchTimeLimit'),
    profilesMenuBtn: document.getElementById('profilesMenuBtn'),
    profilesPanel: document.getElementById('profilesPanel'),
    profilesPanelClose: document.getElementById('profilesPanelClose'),
    profilesPanelBackdrop: document.getElementById('profilesPanelBackdrop'),
    newProfileName: document.getElementById('newProfileName'),
    newProfileChess: document.getElementById('newProfileChess'),
    newProfileEpic: document.getElementById('newProfileEpic'),
    newProfilePhoto: document.getElementById('newProfilePhoto'),
    newProfilePhotoPreview: document.getElementById('newProfilePhotoPreview'),
    newProfilePhotoClear: document.getElementById('newProfilePhotoClear'),
    profileColorPick: document.getElementById('profileColorPick'),
    addProfileBtn: document.getElementById('addProfileBtn'),
    profileList: document.getElementById('profileList'),
    gameGeneral: document.getElementById('gameGeneral'),
    gameFortnite: document.getElementById('gameFortnite'),
    gameChess: document.getElementById('gameChess'),
    teamToolsSection: document.getElementById('teamToolsSection'),
    chessToolsSection: document.getElementById('chessToolsSection'),
    fortniteToolsSection: document.getElementById('fortniteToolsSection'),
    fmtElim: document.getElementById('fmtElim'),
    fmtRR: document.getElementById('fmtRR'),
    fmtBR: document.getElementById('fmtBR'),
    newTeamName: document.getElementById('newTeamName'),
    newTeamHost: document.getElementById('newTeamHost'),
    colorPick: document.getElementById('colorPick'),
    addTeamBtn: document.getElementById('addTeamBtn'),
    teamList: document.getElementById('teamList'),
    teamCount: document.getElementById('teamCount'),
    startBtn: document.getElementById('startBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    resetBtn: document.getElementById('resetBtn'),
    autosaveNote: document.getElementById('autosaveNote'),
    toast: document.getElementById('toast'),
    stageTitle: document.getElementById('stageTitle'),
    stageMeta: document.getElementById('stageMeta'),
    tabMain: document.getElementById('tabMain'),
    tabLive: document.getElementById('tabLive'),
    presentBtn: document.getElementById('presentBtn'),
    exitPresentBtn: document.getElementById('exitPresentBtn'),
    bracketView: document.getElementById('bracketView'),
    standingsView: document.getElementById('standingsView'),
    brView: document.getElementById('brView'),
    liveView: document.getElementById('liveView'),
    newChessUser: document.getElementById('newChessUser'),
    addChessUserBtn: document.getElementById('addChessUserBtn'),
    chessUserList: document.getElementById('chessUserList'),
    refreshChessBtn: document.getElementById('refreshChessBtn'),
    autoRefreshChk: document.getElementById('autoRefreshChk'),
    tcBase: document.getElementById('tcBase'),
    tcIncrement: document.getElementById('tcIncrement'),
    tcSince: document.getElementById('tcSince'),
    applyTcBtn: document.getElementById('applyTcBtn'),
    fnApiKey: document.getElementById('fnApiKey'),
    newFnUser: document.getElementById('newFnUser'),
    addFnUserBtn: document.getElementById('addFnUserBtn'),
    fnUserList: document.getElementById('fnUserList'),
    fnSessBuild: document.getElementById('fnSessBuild'),
    fnSessNoBuild: document.getElementById('fnSessNoBuild'),
    fnPtsKill: document.getElementById('fnPtsKill'),
    fnPtsWin: document.getElementById('fnPtsWin'),
    fnBaselineBtn: document.getElementById('fnBaselineBtn'),
    fnClearBaselineBtn: document.getElementById('fnClearBaselineBtn'),
    fnSnapshotSelect: document.getElementById('fnSnapshotSelect'),
    fnEndSnapshotSelect: document.getElementById('fnEndSnapshotSelect'),
    fnGenSetup: document.getElementById('fnGenSetup'),
    fnGenMode: document.getElementById('fnGenMode'),
    fnGenNote: document.getElementById('fnGenNote'),
    fnBaselineDate: document.getElementById('fnBaselineDate'),
    fnRefreshBtn: document.getElementById('fnRefreshBtn'),
    fnAutoRefreshChk: document.getElementById('fnAutoRefreshChk'),
  };

  // ---------- Color swatches ----------
  PALETTE.forEach(function(c, i){
    var s = document.createElement('div');
    s.className = 'swatch' + (i===0 ? ' selected' : '');
    s.style.background = c;
    s.addEventListener('click', function(){
      selectedColor = c;
      Array.prototype.forEach.call(el.colorPick.children, function(ch){ ch.classList.remove('selected'); });
      s.classList.add('selected');
    });
    el.colorPick.appendChild(s);
  });
  PALETTE.forEach(function(c, i){
    var s = document.createElement('div');
    s.className = 'swatch' + (i===1 ? ' selected' : '');
    s.style.background = c;
    s.addEventListener('click', function(){
      selectedProfileColor = c;
      Array.prototype.forEach.call(el.profileColorPick.children, function(ch){ ch.classList.remove('selected'); });
      s.classList.add('selected');
    });
    el.profileColorPick.appendChild(s);
  });

  // ---------- Player profiles ----------
  function openProfilesPanel(){
    el.profilesPanel.classList.add('open');
    el.profilesPanelBackdrop.classList.add('open');
    el.profilesMenuBtn.classList.add('active');
  }
  function closeProfilesPanel(){
    el.profilesPanel.classList.remove('open');
    el.profilesPanelBackdrop.classList.remove('open');
    el.profilesMenuBtn.classList.remove('active');
  }
  el.profilesMenuBtn.addEventListener('click', function(){
    if(el.profilesPanel.classList.contains('open')){ closeProfilesPanel(); }
    else { openProfilesPanel(); }
  });
  el.profilesPanelClose.addEventListener('click', closeProfilesPanel);
  el.profilesPanelBackdrop.addEventListener('click', closeProfilesPanel);
  el.addProfileBtn.addEventListener('click', addProfile);
  el.newProfileName.addEventListener('keydown', function(e){ if(e.key==='Enter') addProfile(); });

  // Reads an image file, crops/scales it down to a small square, and returns
  // a compact data URL via the callback — keeps saved profiles lightweight.
  function resizeImageToDataUrl(file, maxSize, callback){
    if(!file || !file.type || file.type.indexOf('image/') !== 0){ callback(null); return; }
    var reader = new FileReader();
    reader.onload = function(e){
      var img = new Image();
      img.onload = function(){
        var canvas = document.createElement('canvas');
        canvas.width = maxSize; canvas.height = maxSize;
        var ctx = canvas.getContext('2d');
        var scale = Math.max(maxSize / img.width, maxSize / img.height);
        var w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (maxSize - w) / 2, (maxSize - h) / 2, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function(){ callback(null); };
      img.src = e.target.result;
    };
    reader.onerror = function(){ callback(null); };
    reader.readAsDataURL(file);
  }

  el.newProfilePhoto.addEventListener('change', function(){
    var file = el.newProfilePhoto.files[0];
    if(!file) return;
    resizeImageToDataUrl(file, 128, function(dataUrl){
      pendingProfilePhoto = dataUrl;
      el.newProfilePhotoPreview.className = 'photo-preview' + (dataUrl ? '' : ' empty');
      el.newProfilePhotoPreview.innerHTML = dataUrl ? '<img src="'+dataUrl+'">' : '';
      el.newProfilePhotoClear.style.display = dataUrl ? '' : 'none';
    });
  });
  el.newProfilePhotoClear.addEventListener('click', function(){
    pendingProfilePhoto = null;
    el.newProfilePhoto.value = "";
    el.newProfilePhotoPreview.className = 'photo-preview empty';
    el.newProfilePhotoPreview.innerHTML = "";
    el.newProfilePhotoClear.style.display = 'none';
  });

  function addProfile(){
    var name = el.newProfileName.value.trim();
    if(!name){ el.newProfileName.focus(); return; }
    var chessUsername = el.newProfileChess.value.trim();
    var epicUsername = el.newProfileEpic.value.trim();
    state.profiles.push({
      id: 'p'+(profileUid++), name: name, color: selectedProfileColor,
      chessUsername: chessUsername, epicUsername: epicUsername, photo: pendingProfilePhoto
    });
    el.newProfileName.value = "";
    el.newProfileChess.value = "";
    el.newProfileEpic.value = "";
    pendingProfilePhoto = null;
    el.newProfilePhoto.value = "";
    el.newProfilePhotoPreview.className = 'photo-preview empty';
    el.newProfilePhotoPreview.innerHTML = "";
    el.newProfilePhotoClear.style.display = 'none';
    renderProfileList();
    persistState();
  }

  function cancelEditProfile(){
    editingProfile = null;
    renderProfileList();
  }

  function saveEditProfile(){
    if(!editingProfile) return;
    var name = editingProfile.name.trim();
    if(!name) return;
    var p = state.profiles.filter(function(x){ return x.id === editingProfile.id; })[0];
    if(!p) { editingProfile = null; renderProfileList(); return; }
    p.name = name;
    p.chessUsername = editingProfile.chessUsername.trim();
    p.epicUsername = editingProfile.epicUsername.trim();
    p.color = editingProfile.color;
    p.photo = editingProfile.photo || null;
    editingProfile = null;
    renderProfileList();
    persistState();
  }

  function renderProfileEditCard(card, p){
    var d = editingProfile;
    var swatches = PALETTE.map(function(c){
      return '<div class="swatch'+(c===d.color?' selected':'')+'" data-color="'+c+'" style="background:'+c+'"></div>';
    }).join('');
    card.innerHTML =
      '<div class="field" style="margin-bottom:8px;"><input type="text" id="editProfileName" value="'+escapeHtml(d.name)+'" placeholder="Name"></div>' +
      '<div class="field" style="margin-bottom:8px;"><input type="text" id="editProfileChess" value="'+escapeHtml(d.chessUsername||"")+'" placeholder="Chess.com username (optional)"></div>' +
      '<div class="field" style="margin-bottom:8px;"><input type="text" id="editProfileEpic" value="'+escapeHtml(d.epicUsername||"")+'" placeholder="Epic username (optional)"></div>' +
      '<div class="photo-row" style="margin-bottom:8px;">' +
        '<div class="photo-preview'+(d.photo?'':' empty')+'" id="editProfilePhotoPreview">'+(d.photo?'<img src="'+d.photo+'">':'')+'</div>' +
        '<label class="btn photo-pick-btn" for="editProfilePhoto">'+(d.photo?'Change photo':'Add photo')+'</label>' +
        '<input id="editProfilePhoto" type="file" accept="image/*" style="display:none;">' +
        '<button class="btn-danger-text" id="editProfilePhotoClear" style="'+(d.photo?'':'display:none;')+'">Remove</button>' +
      '</div>' +
      '<div class="color-pick">'+swatches+'</div>' +
      '<div class="profile-edit-actions">' +
        '<button class="btn btn-accent" id="editProfileSave" style="flex:1;">Save</button>' +
        '<button class="btn" id="editProfileCancel" style="flex:1;">Cancel</button>' +
      '</div>';

    card.querySelector('#editProfileName').addEventListener('input', function(e){ editingProfile.name = e.target.value; });
    card.querySelector('#editProfileChess').addEventListener('input', function(e){ editingProfile.chessUsername = e.target.value; });
    card.querySelector('#editProfileEpic').addEventListener('input', function(e){ editingProfile.epicUsername = e.target.value; });
    card.querySelector('#editProfilePhoto').addEventListener('change', function(e){
      var file = e.target.files[0];
      if(!file) return;
      resizeImageToDataUrl(file, 128, function(dataUrl){
        if(dataUrl){ editingProfile.photo = dataUrl; }
        renderProfileList();
      });
    });
    card.querySelector('#editProfilePhotoClear').addEventListener('click', function(){
      editingProfile.photo = null;
      renderProfileList();
    });
    card.querySelectorAll('.color-pick .swatch').forEach(function(sw){
      sw.addEventListener('click', function(){
        editingProfile.color = sw.dataset.color;
        renderProfileList();
      });
    });
    card.querySelector('#editProfileSave').addEventListener('click', saveEditProfile);
    card.querySelector('#editProfileCancel').addEventListener('click', cancelEditProfile);
  }

  function removeProfile(id){
    state.profiles = state.profiles.filter(function(p){ return p.id !== id; });
    renderProfileList();
    persistState();
  }

  function addProfileAsTeam(id){
    var p = state.profiles.filter(function(x){ return x.id === id; })[0];
    if(!p) return;
    if(state.teams.some(function(t){ return t.name.toLowerCase() === p.name.toLowerCase(); })) return;
    state.teams.push({ id: nextId(), name: p.name, host: "", color: p.color });
    renderTeamList();
    renderProfileList();
    persistState();
  }

  function addProfileToChess(id){
    var p = state.profiles.filter(function(x){ return x.id === id; })[0];
    if(!p || !p.chessUsername) return;
    if(state.watchUsers.some(function(u){ return u.username.toLowerCase() === p.chessUsername.toLowerCase(); })) return;
    state.watchUsers.push({ id: 'c'+(chessUserUid++), username: p.chessUsername });
    renderChessUserList();
    renderProfileList();
    fetchAllTC(true);
    persistState();
  }

  function addProfileToFortnite(id){
    var p = state.profiles.filter(function(x){ return x.id === id; })[0];
    if(!p || !p.epicUsername) return;
    if(state.fortniteUsers.some(function(u){ return u.username.toLowerCase() === p.epicUsername.toLowerCase(); })) return;
    state.fortniteUsers.push({ id: 'f'+(fnUserUid++), username: p.epicUsername });
    renderFnUserList();
    renderProfileList();
    refreshFortniteStats(true);
    persistState();
  }

  function renderProfileList(){
    el.profileList.innerHTML = "";
    if(state.profiles.length === 0){
      el.profileList.innerHTML = '<div class="empty-note">No profiles yet — add one above.</div>';
      return;
    }
    state.profiles.forEach(function(p){
      var card = document.createElement('div');
      card.className = 'profile-card';

      if(editingProfile && editingProfile.id === p.id){
        renderProfileEditCard(card, p);
        el.profileList.appendChild(card);
        return;
      }

      var badges = [];
      if(p.chessUsername) badges.push('<span class="profile-badge">♟ '+escapeHtml(p.chessUsername)+'</span>');
      if(p.epicUsername) badges.push('<span class="profile-badge">🎮 '+escapeHtml(p.epicUsername)+'</span>');

      var isTeam = state.teams.some(function(t){ return t.name.toLowerCase() === p.name.toLowerCase(); });
      var isChess = p.chessUsername && state.watchUsers.some(function(u){ return u.username.toLowerCase() === p.chessUsername.toLowerCase(); });
      var isFn = p.epicUsername && state.fortniteUsers.some(function(u){ return u.username.toLowerCase() === p.epicUsername.toLowerCase(); });

      var actions = '<button class="profile-action-btn'+(isTeam?' added':'')+'" data-act="team">'+(isTeam?'✓ Team':'+ Team')+'</button>';
      if(p.chessUsername){
        actions += '<button class="profile-action-btn'+(isChess?' added':'')+'" data-act="chess">'+(isChess?'✓ Chess':'+ Chess')+'</button>';
      }
      if(p.epicUsername){
        actions += '<button class="profile-action-btn'+(isFn?' added':'')+'" data-act="fortnite">'+(isFn?'✓ Fortnite':'+ Fortnite')+'</button>';
      }

      var statLines = [];
      if(isChess){
        var rec = computeTCRecord(p.chessUsername);
        if(rec){
          statLines.push('♟ ' + rec.w+'W-'+rec.d+'D-'+rec.l+'L · '+rec.pts+' pts ('+Math.round(state.trackTC.base/60)+'|'+state.trackTC.increment+')');
        } else {
          statLines.push('♟ Tracked — apply a time control to see their record');
        }
      }
      if(isFn){
        var fc = fortniteCache[p.epicUsername.toLowerCase()];
        var winParts = ['build','nobuild'].map(function(sk){
          var sc = scoreFortnitePlayer(p.epicUsername, sk, state.fortniteModeFilter);
          return sc.needsBaseline ? null : state.fortniteSessions[sk].label + ': ' + sc.points + ' pts';
        }).filter(Boolean);
        if(winParts.length){ statLines.push('🎮 ' + winParts.join(' · ')); }
        else if(fc && fc.error){ statLines.push('🎮 Couldn\'t load Fortnite stats'); }
        else { statLines.push('🎮 Set a session baseline to track live points'); }
      }
      var statsHtml = statLines.length ? '<div class="profile-card-stats">'+statLines.join('<br>')+'</div>' : '';

      var menuOpen = openProfileMenuId === p.id;
      var avatarHtml = p.photo
        ? '<img class="profile-avatar" src="'+p.photo+'">'
        : '<span class="team-dot" style="background:'+p.color+'"></span>';
      card.innerHTML =
        '<div class="profile-card-top">' +
          avatarHtml +
          '<div class="profile-card-text">' +
            '<div class="profile-card-name">'+escapeHtml(p.name)+'</div>' +
            (badges.length ? '<div class="profile-card-badges">'+badges.join('')+'</div>' : '') +
          '</div>' +
          '<div class="profile-menu-wrap">' +
            '<button class="profile-menu-btn" title="Options">☰</button>' +
            (menuOpen ? '<div class="profile-menu-dropdown">' +
              '<button class="profile-menu-item" data-menu-act="edit">Edit</button>' +
              '<button class="profile-menu-item danger" data-menu-act="delete">Delete</button>' +
            '</div>' : '') +
          '</div>' +
        '</div>' +
        statsHtml +
        '<div class="profile-card-actions">'+actions+'</div>';

      card.querySelector('.profile-menu-btn').addEventListener('click', function(e){
        e.stopPropagation();
        openProfileMenuId = menuOpen ? null : p.id;
        renderProfileList();
      });
      if(menuOpen){
        card.querySelector('[data-menu-act="edit"]').addEventListener('click', function(e){
          e.stopPropagation();
          openProfileMenuId = null;
          editingProfile = { id: p.id, name: p.name, chessUsername: p.chessUsername, epicUsername: p.epicUsername, color: p.color, photo: p.photo || null };
          renderProfileList();
        });
        card.querySelector('[data-menu-act="delete"]').addEventListener('click', function(e){
          e.stopPropagation();
          openProfileMenuId = null;
          removeProfile(p.id);
        });
      }
      var teamBtn = card.querySelector('[data-act="team"]');
      if(teamBtn && !isTeam) teamBtn.addEventListener('click', function(){ addProfileAsTeam(p.id); });
      var chessBtn = card.querySelector('[data-act="chess"]');
      if(chessBtn && !isChess) chessBtn.addEventListener('click', function(){ addProfileToChess(p.id); });
      var fnBtn = card.querySelector('[data-act="fortnite"]');
      if(fnBtn && !isFn) fnBtn.addEventListener('click', function(){ addProfileToFortnite(p.id); });

      el.profileList.appendChild(card);
    });
  }

  // ---------- Game selector ----------
  el.gameGeneral.addEventListener('click', function(){ setGame('general'); });
  el.gameFortnite.addEventListener('click', function(){ setGame('fortnite'); });
  el.gameChess.addEventListener('click', function(){ setGame('chess'); });

  function setGame(g){
    state.game = g;
    el.gameGeneral.classList.toggle('active', g==='general');
    el.gameFortnite.classList.toggle('active', g==='fortnite');
    el.gameChess.classList.toggle('active', g==='chess');

    el.teamToolsSection.style.display = g === 'chess' ? 'none' : '';
    el.fortniteToolsSection.style.display = g === 'fortnite' ? '' : 'none';
    el.fnGenSetup.style.display = g === 'fortnite' ? '' : 'none';
    el.startBtn.textContent = g === 'fortnite' ? 'Generate bracket & start window' : 'Generate bracket';
    el.chessToolsSection.style.display = g === 'chess' ? '' : 'none';
    el.tabMain.style.display = g === 'chess' ? 'none' : '';
    el.tabLive.style.display = g === 'general' ? 'none' : '';

    if(g === 'fortnite' && state.format !== 'br'){ setFormat('br'); }
    if(g === 'fortnite' && !el.fnBaselineDate.value){ el.fnBaselineDate.value = nowForDatetimeLocal(); }
    if(g === 'chess'){ switchView('live'); }
    else if(g === 'general' && state.view === 'live'){ switchView('main'); }
    else { switchView(state.view); }

    if(g === 'fortnite' && state.fortniteUsers.length){ refreshFortniteStats(true); }
    if(g === 'chess' && state.watchUsers.length){ fetchAllTC(true); }
    persistState();
  }

  // ---------- Format toggle ----------
  el.fmtElim.addEventListener('click', function(){ setFormat('elim'); });
  el.fmtRR.addEventListener('click', function(){ setFormat('rr'); });
  el.fmtBR.addEventListener('click', function(){ setFormat('br'); });
  function setFormat(fmt){
    state.format = fmt;
    el.fmtElim.classList.toggle('active', fmt==='elim');
    el.fmtRR.classList.toggle('active', fmt==='rr');
    el.fmtBR.classList.toggle('active', fmt==='br');
    if(state.started && state.teams.length >= 2){ buildCurrentFormat(); }
    renderHeader();
  }

  el.tourneyName.addEventListener('input', function(){
    state.name = el.tourneyName.value || "Untitled Tournament";
    renderHeader();
  });
  el.matchTimeLimit.addEventListener('input', function(){
    state.matchTimeLimit = el.matchTimeLimit.value;
    renderHeader();
  });

  // ---------- Team management ----------
  el.addTeamBtn.addEventListener('click', addTeam);
  el.newTeamName.addEventListener('keydown', function(e){ if(e.key==='Enter') addTeam(); });

  function addTeam(){
    var name = el.newTeamName.value.trim();
    if(!name) { el.newTeamName.focus(); return; }
    var host = el.newTeamHost.value.trim();
    state.teams.push({ id: nextId(), name: name, host: host, color: selectedColor });
    el.newTeamName.value = "";
    el.newTeamHost.value = "";
    el.newTeamName.focus();
    renderTeamList();
  }

  function removeTeam(id){
    state.teams = state.teams.filter(function(t){ return t.id !== id; });
    renderTeamList();
  }

  function renderTeamList(){
    renderProfileList();
    el.teamCount.textContent = state.teams.length;
    el.teamList.innerHTML = "";
    if(state.teams.length === 0){
      el.teamList.innerHTML = '<div class="empty-note">No teams yet — add your first one above.</div>';
      return;
    }
    state.teams.forEach(function(t){
      var row = document.createElement('div');
      row.className = 'row-item';
      row.innerHTML =
        '<span class="team-dot" style="background:'+t.color+'"></span>' +
        '<div class="row-item-text">' +
          '<div class="row-item-name">'+escapeHtml(t.name)+'</div>' +
          (t.host ? '<div class="row-item-sub">'+escapeHtml(t.host)+'</div>' : '') +
        '</div>' +
        '<button class="btn-danger-text" title="Remove">✕</button>';
      row.querySelector('.btn-danger-text').addEventListener('click', function(){ removeTeam(t.id); });
      el.teamList.appendChild(row);
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // ---------- Generate tournament ----------
  el.startBtn.addEventListener('click', generateTournament);

  function shuffle(arr){
    var a = arr.slice();
    for(var i=a.length-1;i>0;i--){
      var j = Math.floor(Math.random()*(i+1));
      var tmp=a[i]; a[i]=a[j]; a[j]=tmp;
    }
    return a;
  }

  // Builds whatever the selected format needs from the current teams.
  function buildCurrentFormat(){
    state.started = true;
    if(state.format === 'elim'){
      buildEliminationBracket();
    } else if(state.format === 'rr'){
      buildRoundRobin();
    } else {
      buildBattleRoyale();
    }
    renderAll();
  }

  function generateTournament(){
    if(state.game === 'fortnite'){ generateFortniteTournament(); return; }
    if(state.teams.length < 2){
      showToast("Add at least 2 teams first.", true);
      return;
    }
    buildCurrentFormat();
  }

  // Fortnite: one click configures mode, session and time window, creates a team per
  // tracked player, and starts the Battle Royale leaderboard. A valid baseline is required.
  function generateFortniteTournament(){
    if(!state.fortniteApiKey){ showToast('Add your Fortnite-API.com key first.', true); return; }
    if(state.fortniteUsers.length < 2){ showToast('Track at least 2 Epic usernames first.', true); return; }
    var sk = state.fortniteActiveSession;
    var w = state.fortniteSessions[sk].timeWindow;
    if(w.startTs != null && !getWindowSnaps(sk)){
      showToast('The window end must be after its start.', true);
      return;
    }
    var ready = getWindowSnaps(sk) ? Promise.resolve(true) : setFortniteBaseline(sk);
    ready.then(function(ok){
      if(!ok || !getWindowSnaps(sk)){
        showToast('No valid baseline, so the tournament was not generated.', true);
        return;
      }
      if(state.format !== 'br'){ setFormat('br'); }
      state.fortniteUsers.forEach(function(u, i){ findOrCreateTeamForPlayer(u.username, i); });
      buildCurrentFormat();
      switchView('live');
      persistState();
      var modeName = state.fortniteModeFilter === 'all' ? 'All modes' : MODE_LABELS[state.fortniteModeFilter];
      showToast('Bracket generated: ' + modeName + ' · ' + state.fortniteSessions[sk].label + ' · window ' + windowLabel(getWindowSnaps(sk)));
    });
  }

  function buildEliminationBracket(){
    var teams = shuffle(state.teams);
    var size = 1;
    while(size < teams.length) size *= 2;
    while(teams.length < size) teams.push(null); // bye

    var round0 = [];
    for(var i=0;i<size;i+=2){
      round0.push(makeMatch(teams[i], teams[i+1]));
    }
    state.rounds = [round0];
    autoAdvanceByes(state.rounds[0]);
    while(state.rounds[state.rounds.length-1].length > 1){
      var prev = state.rounds[state.rounds.length-1];
      var next = [];
      for(var k=0;k<prev.length;k+=2){
        next.push(makeMatch(prev[k].winner || null, prev[k+1].winner || null));
      }
      state.rounds.push(next);
      autoAdvanceByes(next);
    }
  }

  function makeMatch(a, b){
    return { a: a, b: b, scoreA: null, scoreB: null, winner: null };
  }

  function autoAdvanceByes(round){
    round.forEach(function(m){
      if(m.a && !m.b) m.winner = m.a;
      if(m.b && !m.a) m.winner = m.b;
    });
  }

  function propagateWinners(){
    for(var r=0; r<state.rounds.length-1; r++){
      var cur = state.rounds[r], next = state.rounds[r+1];
      for(var i=0;i<cur.length;i++){
        var slot = Math.floor(i/2);
        var isA = i % 2 === 0;
        var w = cur[i].winner || null;
        if(isA) next[slot].a = w; else next[slot].b = w;
      }
      autoAdvanceByes(next);
    }
  }

  function setScore(round, idx, side, val){
    var m = state.rounds[round][idx];
    var n = val === "" ? null : Math.max(0, parseInt(val,10) || 0);
    if(side === 'A') m.scoreA = n; else m.scoreB = n;
    if(m.a && m.b && m.scoreA !== null && m.scoreB !== null && m.scoreA !== m.scoreB){
      m.winner = m.scoreA > m.scoreB ? m.a : m.b;
    } else if(m.scoreA === m.scoreB){
      m.winner = null;
    }
    propagateWinners();
    renderBracket();
  }

  function buildRoundRobin(){
    var teams = state.teams.slice();
    state.rrMatches = [];
    for(var i=0;i<teams.length;i++){
      for(var j=i+1;j<teams.length;j++){
        state.rrMatches.push({ a: teams[i], b: teams[j], scoreA: null, scoreB: null });
      }
    }
  }

  function setRRScore(idx, side, val){
    var m = state.rrMatches[idx];
    var n = val === "" ? null : Math.max(0, parseInt(val,10) || 0);
    if(side === 'A') m.scoreA = n; else m.scoreB = n;
    renderStandings();
  }

  // ---------- Battle royale ----------
  function buildBattleRoyale(){
    if(state.brGames.length === 0){ addBRGame(); }
  }

  function addBRGame(){
    var entries = {};
    state.teams.forEach(function(t){ entries[t.id] = { placement: null, elims: 0 }; });
    state.brGames.push({ id: 'g'+(brGameUid++), entries: entries });
  }

  function removeBRGame(gameId){
    state.brGames = state.brGames.filter(function(g){ return g.id !== gameId; });
    renderBR();
  }

  function setBRValue(gameId, teamId, field, val){
    var game = state.brGames.filter(function(g){ return g.id === gameId; })[0];
    if(!game) return;
    if(!game.entries[teamId]) game.entries[teamId] = { placement:null, elims:0 };
    var n = val === "" ? (field === 'placement' ? null : 0) : Math.max(0, parseInt(val,10) || 0);
    game.entries[teamId][field] = n;
    renderBR();
  }

  function placementPoints(place, teamCount){
    if(!place || place < 1) return 0;
    var pts = teamCount - place + 1;
    return pts > 0 ? pts : 0;
  }

  function computeBRLeaderboard(){
    var teamCount = state.teams.length;
    var stats = {};
    state.teams.forEach(function(t){ stats[t.id] = { team:t, points:0, elims:0, games:0, bestPlacement:null }; });
    state.brGames.forEach(function(g){
      state.teams.forEach(function(t){
        var e = g.entries[t.id];
        if(!e) return;
        var played = (e.placement !== null && e.placement !== '') || e.elims > 0;
        if(!played) return;
        var s = stats[t.id];
        s.games++;
        s.elims += e.elims || 0;
        var pp = placementPoints(e.placement, teamCount);
        s.points += pp + (e.elims || 0) * state.brElimPoints;
        if(e.placement){
          s.bestPlacement = s.bestPlacement === null ? e.placement : Math.min(s.bestPlacement, e.placement);
        }
      });
    });
    var rows = Object.keys(stats).map(function(k){ return stats[k]; });
    rows.sort(function(a,b){ return b.points - a.points; });
    return rows;
  }

  // ---------- Rendering: header / tabs ----------
  function renderHeader(){
    el.stageTitle.textContent = state.name;
    var mainLabel = state.format === 'elim' ? 'Bracket' : (state.format === 'rr' ? 'Standings' : 'Battle royale');
    el.tabMain.textContent = mainLabel;
    var timeSuffix = state.matchTimeLimit ? ' · ' + state.matchTimeLimit : '';
    if(!state.started){
      el.stageMeta.textContent = (state.teams.length
        ? state.teams.length + " team" + (state.teams.length===1?"":"s") + " ready — generate when you're set."
        : "Add teams to get started.") + timeSuffix;
    } else if(state.format === 'elim'){
      var champ = getChampion();
      el.stageMeta.textContent = (champ ? "Champion: " + champ.name : (state.teams.length + " teams · single elimination")) + timeSuffix;
    } else if(state.format === 'rr'){
      el.stageMeta.textContent = state.teams.length + " teams · round robin" + timeSuffix;
    } else {
      var lb = state.brGames.length ? computeBRLeaderboard() : [];
      var leader = lb.length && lb[0].points > 0 ? lb[0].team.name : null;
      var fnSuffix = state.game === 'fortnite'
        ? ' · ' + (state.fortniteModeFilter === 'all' ? 'All modes' : MODE_LABELS[state.fortniteModeFilter]) + ' · ' + state.fortniteSessions[state.fortniteActiveSession].label
        : '';
      el.stageMeta.textContent = state.teams.length + " teams · " + state.brGames.length + " game" + (state.brGames.length===1?"":"s") + (leader ? " · leading: " + leader : "") + fnSuffix + timeSuffix;
    }
    persistState();
  }

  function getChampion(){
    if(state.rounds.length === 0) return null;
    var last = state.rounds[state.rounds.length-1];
    return last[0] ? last[0].winner : null;
  }

  function renderAll(){
    renderTeamList();
    renderHeader();
    renderBracket();
    renderStandings();
    renderBR();
    switchView(state.view);
  }

  function switchView(v){
    state.view = v;
    el.tabMain.classList.toggle('active', v==='main');
    el.tabLive.classList.toggle('active', v==='live');

    el.bracketView.style.display = 'none';
    el.standingsView.style.display = 'none';
    el.brView.style.display = 'none';
    el.liveView.style.display = 'none';

    if(v === 'live'){
      el.liveView.style.display = '';
      renderLiveView();
      return;
    }
    if(state.format === 'elim'){ el.bracketView.style.display = ''; }
    else if(state.format === 'rr'){ el.standingsView.style.display = ''; }
    else { el.brView.style.display = ''; }
  }
  el.tabMain.addEventListener('click', function(){ switchView('main'); });
  el.tabLive.addEventListener('click', function(){
    switchView('live');
    if(state.game === 'fortnite'){ refreshFortniteStats(true); }
    else if(state.game === 'chess'){ fetchAllTC(true); }
  });

  // ---------- Rendering: bracket ----------
  function teamPill(t){
    if(!t){
      return '<div class="slot-team"><span class="slot-name tbd">TBD</span></div>';
    }
    return '<div class="slot-team">' +
        '<span class="slot-dot" style="background:'+t.color+'"></span>' +
        '<span class="slot-name">'+escapeHtml(t.name)+'</span>' +
        (t.host ? '<span class="slot-host">'+escapeHtml(t.host)+'</span>' : '') +
      '</div>';
  }

  function renderBracket(){
    if(state.format !== 'elim' || state.rounds.length === 0){
      el.bracketView.innerHTML = state.started ? '' : (document.body.classList.contains('locked-view') ? '<div class="empty-note">There is no match at the moment.</div>' : '<div class="empty-note">No bracket yet. Add teams and click "Generate bracket".</div>');
      return;
    }
    var html = '<div class="bracket-wrap"><div class="bracket">';
    state.rounds.forEach(function(round, rIdx){
      var isFinal = rIdx === state.rounds.length - 1;
      var title = isFinal ? "Final" : (round.length === 2 ? "Semifinal" : ("Round " + (rIdx+1)));
      html += '<div class="round-col"><div class="round-title">'+title+'</div><div class="round-inner">';
      round.forEach(function(m, mIdx){
        var isBye = (m.a && !m.b) || (m.b && !m.a);
        html += '<div class="match-card">';
        html += matchSlot(m, 'A', rIdx, mIdx, isBye);
        html += matchSlot(m, 'B', rIdx, mIdx, isBye);
        html += '</div>';
      });
      html += '</div></div>';
    });
    html += '</div></div>';

    var champ = getChampion();
    if(champ){
      html += '<div class="champion-card"><div class="champion-label">Champion</div>' +
        '<div class="champion-name">'+escapeHtml(champ.name)+'</div>' +
        (champ.host ? '<div class="champion-host">'+escapeHtml(champ.host)+'</div>' : '') +
        '</div>';
    }
    el.bracketView.innerHTML = html;

    el.bracketView.querySelectorAll('input.score-input').forEach(function(inp){
      inp.addEventListener('input', function(){
        setScore(parseInt(inp.dataset.round,10), parseInt(inp.dataset.idx,10), inp.dataset.side, inp.value);
      });
    });
    renderHeader();
  }

  function matchSlot(m, side, rIdx, mIdx, isBye){
    var t = side === 'A' ? m.a : m.b;
    var score = side === 'A' ? m.scoreA : m.scoreB;
    var isWinner = m.winner && t && m.winner.id === t.id;
    var cls = 'match-slot' + (isWinner ? ' winner' : '') + (isBye ? ' bye' : '');
    var scoreField = t
      ? '<input class="score-input" type="number" min="0" data-round="'+rIdx+'" data-idx="'+mIdx+'" data-side="'+side+'" value="'+(score===null?'':score)+'" '+(isBye?'disabled':'')+'>'
      : '';
    return '<div class="'+cls+'">' + teamPill(t) + scoreField + '</div>';
  }

  // ---------- Rendering: standings (round robin) ----------
  function renderStandings(){
    if(state.format !== 'rr'){ return; }
    if(state.rrMatches.length === 0){
      el.standingsView.innerHTML = state.started ? '' : (document.body.classList.contains('locked-view') ? '<div class="empty-note">There is no match at the moment.</div>' : '<div class="empty-note">No schedule yet. Add teams and click "Generate bracket".</div>');
      return;
    }
    var stats = {};
    state.teams.forEach(function(t){ stats[t.id] = { team:t, w:0,l:0,d:0, gf:0, ga:0, pts:0 }; });
    state.rrMatches.forEach(function(m){
      if(m.scoreA===null || m.scoreB===null) return;
      var sa = stats[m.a.id], sb = stats[m.b.id];
      sa.gf += m.scoreA; sa.ga += m.scoreB;
      sb.gf += m.scoreB; sb.ga += m.scoreA;
      if(m.scoreA > m.scoreB){ sa.w++; sb.l++; sa.pts+=3; }
      else if(m.scoreB > m.scoreA){ sb.w++; sa.l++; sb.pts+=3; }
      else { sa.d++; sb.d++; sa.pts++; sb.pts++; }
    });
    var rows = Object.keys(stats).map(function(k){ return stats[k]; });
    rows.sort(function(x,y){
      if(y.pts !== x.pts) return y.pts - x.pts;
      return (y.gf-y.ga) - (x.gf-x.ga);
    });

    var html = '<table class="standings"><thead><tr>' +
      '<th class="num">#</th><th>Team</th><th class="num">W</th><th class="num">D</th><th class="num">L</th>' +
      '<th class="num">GF</th><th class="num">GA</th><th class="num">Pts</th></tr></thead><tbody>';
    rows.forEach(function(r, i){
      html += '<tr class="'+(i===0?'rank-1':'')+'">' +
        '<td class="num rank-badge">'+(i+1)+'</td>' +
        '<td><span class="team-dot" style="background:'+r.team.color+';display:inline-block;margin-right:8px;"></span>'+escapeHtml(r.team.name)+'</td>' +
        '<td class="num">'+r.w+'</td><td class="num">'+r.d+'</td><td class="num">'+r.l+'</td>' +
        '<td class="num">'+r.gf+'</td><td class="num">'+r.ga+'</td>' +
        '<td class="num">'+r.pts+'</td></tr>';
    });
    html += '</tbody></table>';

    html += '<div class="schedule-list"><div class="schedule-round"><h3>Fixtures</h3><div class="fixture-grid">';
    state.rrMatches.forEach(function(m, idx){
      html += '<div class="fixture">' +
        '<div class="side"><span class="slot-dot" style="width:9px;height:9px;border-radius:50%;background:'+m.a.color+';display:inline-block;"></span><span>'+escapeHtml(m.a.name)+'</span></div>' +
        '<input class="score-input" type="number" min="0" data-idx="'+idx+'" data-side="A" value="'+(m.scoreA===null?'':m.scoreA)+'">' +
        '<span class="vs">vs</span>' +
        '<input class="score-input" type="number" min="0" data-idx="'+idx+'" data-side="B" value="'+(m.scoreB===null?'':m.scoreB)+'">' +
        '<div class="side" style="justify-content:flex-end;text-align:right;"><span>'+escapeHtml(m.b.name)+'</span><span class="slot-dot" style="width:9px;height:9px;border-radius:50%;background:'+m.b.color+';display:inline-block;"></span></div>' +
        '</div>';
    });
    html += '</div></div></div>';

    el.standingsView.innerHTML = html;
    el.standingsView.querySelectorAll('input.score-input').forEach(function(inp){
      inp.addEventListener('input', function(){
        setRRScore(parseInt(inp.dataset.idx,10), inp.dataset.side, inp.value);
      });
    });
    renderHeader();
  }

  // ---------- Rendering: battle royale ----------
  function renderBR(){
    if(state.format !== 'br'){ return; }
    if(state.brGames.length === 0){
      el.brView.innerHTML = state.started ? '' : (document.body.classList.contains('locked-view') ? '<div class="empty-note">There is no match at the moment.</div>' : '<div class="empty-note">No games yet. Add teams and click "Generate bracket".</div>');
      return;
    }
    var lb = computeBRLeaderboard();
    var html = '';

    html += '<div class="br-config"><div class="br-config-item"><label>Points per elim</label>' +
      '<input id="brElimPtsInput" type="number" min="0" value="'+state.brElimPoints+'"></div>' +
      '<div class="br-config-item" style="color:var(--muted);font-size:0.78rem;">Placement points scale from '+state.teams.length+' (1st) down to 1 (last)</div></div>';

    html += '<table class="standings"><thead><tr>' +
      '<th class="num">#</th><th>Team</th><th class="num">Games</th><th class="num">Elims</th><th class="num">Best finish</th><th class="num">Points</th></tr></thead><tbody>';
    lb.forEach(function(r, i){
      html += '<tr class="'+(i===0?'rank-1':'')+'">' +
        '<td class="num rank-badge">'+(i+1)+'</td>' +
        '<td><span class="team-dot" style="background:'+r.team.color+';display:inline-block;margin-right:8px;"></span>'+escapeHtml(r.team.name)+'</td>' +
        '<td class="num">'+r.games+'</td>' +
        '<td class="num">'+r.elims+'</td>' +
        '<td class="num">'+(r.bestPlacement ? '#'+r.bestPlacement : '—')+'</td>' +
        '<td class="num br-pts">'+r.points+'</td></tr>';
    });
    html += '</tbody></table>';

    html += '<div class="br-games">';
    state.brGames.forEach(function(g, gIdx){
      html += '<div class="br-game"><div class="br-game-head"><h3>'+(g.label ? escapeHtml(g.label) : 'Game '+(gIdx+1))+'</h3>' +
        (state.brGames.length > 1 ? '<button class="btn-danger-text" data-remove-game="'+g.id+'">Remove game</button>' : '') +
        '</div>';
      html += '<table class="br-game-table"><thead><tr><th>Team</th><th>Placement</th><th>Elims</th></tr></thead><tbody>';
      state.teams.forEach(function(t){
        var e = g.entries[t.id] || { placement:null, elims:0 };
        html += '<tr><td><span class="team-dot" style="background:'+t.color+';display:inline-block;margin-right:8px;"></span>'+escapeHtml(t.name)+'</td>' +
          '<td><input type="number" min="1" data-game="'+g.id+'" data-team="'+t.id+'" data-field="placement" value="'+(e.placement===null?'':e.placement)+'" placeholder="—"></td>' +
          '<td><input type="number" min="0" data-game="'+g.id+'" data-team="'+t.id+'" data-field="elims" value="'+(e.elims||0)+'"></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    });
    html += '</div>';
    html += '<button class="btn btn-accent" id="addGameBtn" style="margin-top:16px;">Add game</button>';

    el.brView.innerHTML = html;

    var ptsInput = document.getElementById('brElimPtsInput');
    if(ptsInput){
      ptsInput.addEventListener('input', function(){
        state.brElimPoints = Math.max(0, parseInt(ptsInput.value,10) || 0);
        renderBR();
      });
    }
    el.brView.querySelectorAll('input[data-game]').forEach(function(inp){
      inp.addEventListener('input', function(){
        setBRValue(inp.dataset.game, inp.dataset.team, inp.dataset.field, inp.value);
      });
    });
    el.brView.querySelectorAll('[data-remove-game]').forEach(function(btn){
      btn.addEventListener('click', function(){ removeBRGame(btn.dataset.removeGame); });
    });
    var addBtn = document.getElementById('addGameBtn');
    if(addBtn){ addBtn.addEventListener('click', function(){ addBRGame(); renderBR(); }); }

    renderHeader();
  }

  // ---------- Track players (Chess.com) ----------
  el.addChessUserBtn.addEventListener('click', addChessUser);
  el.newChessUser.addEventListener('keydown', function(e){ if(e.key==='Enter') addChessUser(); });
  el.refreshChessBtn.addEventListener('click', function(){ fetchAllTC(true); });
  el.autoRefreshChk.addEventListener('change', setupAutoRefresh);

  function addChessUser(){
    var name = el.newChessUser.value.trim().replace(/^@/,'');
    if(!name) { el.newChessUser.focus(); return; }
    if(state.watchUsers.some(function(u){ return u.username.toLowerCase() === name.toLowerCase(); })){
      el.newChessUser.value = "";
      return;
    }
    state.watchUsers.push({ id: 'c'+(chessUserUid++), username: name });
    el.newChessUser.value = "";
    renderChessUserList();
    fetchAllTC(true);
    persistState();
  }

  function removeChessUser(id){
    state.watchUsers = state.watchUsers.filter(function(u){ return u.id !== id; });
    renderChessUserList();
    if(state.view === 'live'){ renderLiveView(); }
    persistState();
  }

  function renderChessUserList(){
    renderProfileList();
    el.chessUserList.innerHTML = "";
    if(state.watchUsers.length === 0){
      el.chessUserList.innerHTML = '<div class="empty-note">No players tracked yet.</div>';
      return;
    }
    state.watchUsers.forEach(function(u){
      var row = document.createElement('div');
      row.className = 'row-item';
      row.innerHTML =
        '<div class="row-item-text"><div class="row-item-name">'+escapeHtml(u.username)+'</div></div>' +
        '<button class="btn-danger-text" title="Remove">✕</button>';
      row.querySelector('.btn-danger-text').addEventListener('click', function(){ removeChessUser(u.id); });
      el.chessUserList.appendChild(row);
    });
  }

  // ---------- Track players (Fortnite) ----------
  el.fnApiKey.addEventListener('input', function(){ state.fortniteApiKey = el.fnApiKey.value.trim(); persistState(); });
  el.addFnUserBtn.addEventListener('click', addFnUser);
  el.newFnUser.addEventListener('keydown', function(e){ if(e.key==='Enter') addFnUser(); });
  el.fnSessBuild.addEventListener('click', function(){ setFnSession('build'); });
  el.fnSessNoBuild.addEventListener('click', function(){ setFnSession('nobuild'); });
  el.fnPtsKill.addEventListener('input', function(){
    state.fortnitePoints.perKill = Math.max(0, parseFloat(el.fnPtsKill.value) || 0);
    persistState();
    if(state.view === 'live'){ renderLiveView(); }
  });
  el.fnPtsWin.addEventListener('input', function(){
    state.fortnitePoints.perWin = Math.max(0, parseFloat(el.fnPtsWin.value) || 0);
    persistState();
    if(state.view === 'live'){ renderLiveView(); }
  });
  el.fnSnapshotSelect.addEventListener('change', function(){
    setFnWindowBound(state.fortniteActiveSession, 'start', el.fnSnapshotSelect.value);
  });
  el.fnEndSnapshotSelect.addEventListener('change', function(){
    setFnWindowBound(state.fortniteActiveSession, 'end', el.fnEndSnapshotSelect.value);
  });
  el.fnGenMode.addEventListener('change', function(){
    state.fortniteModeFilter = el.fnGenMode.value;
    fnHistoryShowResults = false;
    persistState();
    renderHeader();
    renderProfileList();
    if(state.view === 'live'){ renderLiveView(); }
  });
  el.fnBaselineBtn.addEventListener('click', function(){ setFortniteBaseline(); });
  el.fnClearBaselineBtn.addEventListener('click', function(){ deleteSelectedFortniteSnapshot(); });
  el.fnRefreshBtn.addEventListener('click', function(){ refreshFortniteStats(true); });
  el.fnAutoRefreshChk.addEventListener('change', setupFnAutoRefresh);

  function nowForDatetimeLocal(){
    var d = new Date();
    var pad = function(n){ return n < 10 ? '0'+n : ''+n; };
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function setFnSession(s){
    state.fortniteActiveSession = s;
    el.fnSessBuild.classList.toggle('active', s === 'build');
    el.fnSessNoBuild.classList.toggle('active', s === 'nobuild');
    renderFnSnapshotSelect();
  }

  function renderFnSnapshotSelect(){
    var sessionKey = state.fortniteActiveSession;
    var session = state.fortniteSessions[sessionKey];
    var w = session.timeWindow;
    var snaps = session.baselineHistory.slice().sort(function(a,b){ return b.ts - a.ts; });
    var label = function(sn){ return escapeHtml(new Date(sn.ts*1000).toLocaleString()); };

    var startOpts = ['<option value="">New baseline (captured when you generate)</option>'];
    snaps.forEach(function(sn){ startOpts.push('<option value="'+sn.ts+'">'+label(sn)+'</option>'); });
    el.fnSnapshotSelect.innerHTML = startOpts.join('');
    el.fnSnapshotSelect.value = w.startTs != null ? String(w.startTs) : "";

    var endOpts = ['<option value="">Live (now)</option>'];
    if(w.startTs != null){
      snaps.filter(function(sn){ return sn.ts > w.startTs; })
        .forEach(function(sn){ endOpts.push('<option value="'+sn.ts+'">'+label(sn)+'</option>'); });
    }
    el.fnEndSnapshotSelect.innerHTML = endOpts.join('');
    el.fnEndSnapshotSelect.value = w.endTs != null ? String(w.endTs) : "";
    el.fnEndSnapshotSelect.disabled = w.startTs == null;

    var win = getWindowSnaps(sessionKey);
    el.fnGenNote.textContent = win
      ? 'Active window: ' + windowLabel(win) + '.'
      : 'No window yet. Generating will capture a baseline from live stats and start the window now.';
  }

  // Change one end of the strict time window. The end must be after the start or it resets to live.
  function setFnWindowBound(sessionKey, which, val){
    var w = state.fortniteSessions[sessionKey].timeWindow;
    var ts = val ? parseInt(val, 10) : null;
    if(which === 'start'){
      w.startTs = ts;
      if(ts == null || (w.endTs != null && w.endTs <= ts)) w.endTs = null;
    } else {
      if(w.startTs == null) return;
      w.endTs = (ts != null && ts > w.startTs) ? ts : null;
    }
    persistState();
    renderFnSnapshotSelect();
    renderProfileList();
    if(state.view === 'live'){ renderLiveView(); }
  }

  function addFnUser(){
    var name = el.newFnUser.value.trim();
    if(!name) { el.newFnUser.focus(); return; }
    if(state.fortniteUsers.some(function(u){ return u.username.toLowerCase() === name.toLowerCase(); })){
      el.newFnUser.value = "";
      return;
    }
    state.fortniteUsers.push({ id: 'f'+(fnUserUid++), username: name });
    el.newFnUser.value = "";
    renderFnUserList();
    refreshFortniteStats(true);
    persistState();
  }

  function removeFnUser(id){
    state.fortniteUsers = state.fortniteUsers.filter(function(u){ return u.id !== id; });
    renderFnUserList();
    if(state.view === 'live'){ renderLiveView(); }
    persistState();
  }

  function renderFnUserList(){
    renderProfileList();
    el.fnUserList.innerHTML = "";
    if(state.fortniteUsers.length === 0){
      el.fnUserList.innerHTML = '<div class="empty-note">No players tracked yet.</div>';
      return;
    }
    state.fortniteUsers.forEach(function(u){
      var row = document.createElement('div');
      row.className = 'row-item';
      var tags = [];
      ['build','nobuild'].forEach(function(sk){
        var n = state.fortniteSessions[sk].baselineHistory.length;
        if(n) tags.push(state.fortniteSessions[sk].label + ': ' + n + ' snapshot' + (n===1?'':'s'));
      });
      row.innerHTML =
        '<div class="row-item-text"><div class="row-item-name">'+escapeHtml(u.username)+'</div>' +
        (tags.length ? '<div class="row-item-sub">'+tags.join(' · ')+'</div>' : '') + '</div>' +
        '<button class="btn-danger-text" title="Remove">✕</button>';
      row.querySelector('.btn-danger-text').addEventListener('click', function(){ removeFnUser(u.id); });
      el.fnUserList.appendChild(row);
    });
  }

  function fetchFortniteStats(username){
    var key = username.toLowerCase();
    fortniteCache[key] = fortniteCache[key] || {};
    fortniteCache[key].loading = true;
    if(!state.fortniteApiKey){
      fortniteCache[key] = { loading:false, error: 'Add a free API key above first (fortnite-api.com/profile).', fetchedAt: Math.floor(Date.now()/1000) };
      return Promise.resolve();
    }
    return fetch('https://fortnite-api.com/v2/stats/br/v2?name='+encodeURIComponent(username)+'&image=none', {
        headers: { 'Authorization': state.fortniteApiKey }
      })
      .then(function(r){
        if(r.status === 401 || r.status === 403) throw new Error('key');
        if(!r.ok) throw new Error('status');
        return r.json();
      })
      .then(function(d){
        var statsAll = d.data && d.data.stats && d.data.stats.all;
        if(!statsAll || !statsAll.overall) throw new Error('nodata');
        fortniteCache[key] = { loading:false, stats: statsAll.overall, statsAll: statsAll, fetchedAt: Math.floor(Date.now()/1000) };
      })
      .catch(function(err){
        var msg = err && err.message === 'key'
          ? "API key rejected — check the key or that it's confirmed on fortnite-api.com."
          : "Couldn't load stats — check the username, or Fortnite-API.com may be blocking requests from this page.";
        fortniteCache[key] = { loading:false, error: msg, fetchedAt: Math.floor(Date.now()/1000) };
      });
  }

  // Captures the player's CURRENT live API numbers as a snapshot. If the session has no
  // time window yet, this snapshot becomes the window start. Resolves true on success.
  function setFortniteBaseline(forSession){
    var sessionKey = forSession || state.fortniteActiveSession;
    var session = state.fortniteSessions[sessionKey];
    if(!state.fortniteApiKey){ showToast('Add your Fortnite-API.com key first.', true); return Promise.resolve(false); }
    if(state.fortniteUsers.length === 0){ showToast('Track at least one Epic username first.', true); return Promise.resolve(false); }

    var dateVal = el.fnBaselineDate.value;
    var ts = dateVal ? Math.floor(new Date(dateVal).getTime()/1000) : Math.floor(Date.now()/1000);
    var lastTs = session.baselineHistory.reduce(function(m, sn){ return Math.max(m, sn.ts); }, 0);
    // A snapshot always holds the numbers from right now, so it can never sit before an earlier one.
    if(ts <= lastTs) ts = lastTs + 1;

    renderFnUserList();
    var chain = Promise.resolve();
    var byUser = {};
    state.fortniteUsers.forEach(function(u){
      chain = chain.then(function(){
        return fetchFortniteStats(u.username).then(function(){
          var key = u.username.toLowerCase();
          var c = fortniteCache[key];
          if(c && !c.error && c.statsAll){ byUser[key] = c.statsAll; }
        });
      });
    });
    return chain.then(function(){
      if(Object.keys(byUser).length === 0){
        showToast("Couldn't capture any player data. Check the API key and usernames.", true);
        return false;
      }
      // The old "live" segment becomes a closed one: move its overrides to the new key.
      if(lastTs){
        Object.keys(state.fortniteOverrides).forEach(function(k){
          var parts = k.split('|'); // user | session | fromTs | toTs-or-live
          if(parts[1] === sessionKey && parts[3] === 'live' && parts[2] === String(lastTs)){
            state.fortniteOverrides[parts[0]+'|'+parts[1]+'|'+parts[2]+'|'+ts] = state.fortniteOverrides[k];
            delete state.fortniteOverrides[k];
          }
        });
      }
      session.baselineHistory.push({ ts: ts, byUser: byUser });
      if(session.timeWindow.startTs == null){ session.timeWindow = { startTs: ts, endTs: null }; }
      renderFnUserList();
      renderFnSnapshotSelect();
      renderProfileList();
      el.fnBaselineDate.value = nowForDatetimeLocal();
      if(state.view === 'live'){ renderLiveView(); }
      persistState();
      return true;
    });
  }

  // Deletes the window's START snapshot and clears the window (back to the "set a baseline" prompt).
  function deleteSelectedFortniteSnapshot(){
    var sessionKey = state.fortniteActiveSession;
    var session = state.fortniteSessions[sessionKey];
    if(session.timeWindow.startTs == null){
      showToast('Pick a start snapshot from the dropdown first.', true);
      return;
    }
    confirmOnClick(el.fnClearBaselineBtn, function(){
      var goneNum = session.timeWindow.startTs, goneTs = String(goneNum);
      Object.keys(state.fortniteOverrides).forEach(function(k){
        var parts = k.split('|');
        if(parts[1] === sessionKey && (parts[2] === goneTs || parts[3] === goneTs)) delete state.fortniteOverrides[k];
      });
      session.baselineHistory = session.baselineHistory.filter(function(sn){ return sn.ts !== goneNum; });
      session.timeWindow = { startTs: null, endTs: null };
      renderFnUserList();
      renderFnSnapshotSelect();
      renderProfileList();
      if(state.view === 'live'){ renderLiveView(); }
      persistState();
      showToast('Snapshot deleted. Set a new baseline to keep scoring.');
    }, 'Click again to delete');
  }

  function refreshFortniteStats(rerender){
    var chain = Promise.resolve();
    state.fortniteUsers.forEach(function(u){
      chain = chain.then(function(){ return fetchFortniteStats(u.username); });
    });
    return chain.then(function(){
      renderProfileList();
      if(rerender && state.view === 'live' && !fnOverrideOpen){ renderLiveView(); }
    });
  }

  function setupFnAutoRefresh(){
    if(fnAutoRefreshTimer){ clearInterval(fnAutoRefreshTimer); fnAutoRefreshTimer = null; }
    if(el.fnAutoRefreshChk.checked){
      fnAutoRefreshTimer = setInterval(function(){ refreshFortniteStats(true); }, 45000);
    }
  }

  var MODE_LABELS = { solo: 'Solo', duo: 'Duo', trio: 'Trio', squad: 'Squad' };

  // FN_ENGINE_START ------------------------------------------------------
  // Scoring engine: raw API snapshots -> per-mode segment deltas -> manual
  // override -> mode filter -> points. Raw snapshots are never mutated.
  var FN_MODES = ['solo','duo','trio','squad'];
  var FN_BUCKETS = FN_MODES.concat(['other']); // 'other' = LTM + anything the API did not break down
  var fnOverrideOpen = null; // UI only, never persisted

  function n0(v){ return (typeof v === 'number' && isFinite(v)) ? v : 0; }
  function zero(){ return { matches:0, kills:0, wins:0 }; }
  function clone(b){ return { matches:b.matches, kills:b.kills, wins:b.wins }; }
  function addInto(a, b){ a.matches += b.matches; a.kills += b.kills; a.wins += b.wins; return a; }
  function sumBuckets(b){ var t = zero(); FN_BUCKETS.forEach(function(k){ addInto(t, b[k]); }); return t; }
  function delta(f, t){
    f = f || {}; t = t || {};
    return { matches: Math.max(0, n0(t.matches) - n0(f.matches)),
             kills:   Math.max(0, n0(t.kills)   - n0(f.kills)),
             wins:    Math.max(0, n0(t.wins)    - n0(f.wins)) };
  }

  // Raw API delta -> per-mode buckets. Never throws on missing/partial mode data.
  function rawBuckets(fromRaw, toRaw){
    var out = { buckets:{}, complete:true, missing:false };
    FN_BUCKETS.forEach(function(k){ out.buckets[k] = zero(); });
    if(!fromRaw || !toRaw){ out.missing = true; out.complete = false; return out; }

    var overall = delta(fromRaw.overall || fromRaw, toRaw.overall || toRaw); // old snapshots stored bare overall
    var shapeOk = !!(fromRaw.overall && toRaw.overall);
    var anyMode = FN_MODES.some(function(m){ return !!toRaw[m]; });
    var sum = zero();
    if(shapeOk && anyMode){
      FN_MODES.forEach(function(m){
        out.buckets[m] = delta(fromRaw[m], toRaw[m]); // mode absent on one side = never queued = zero
        addInto(sum, out.buckets[m]);
      });
    }
    out.buckets.other = { matches: Math.max(0, overall.matches - sum.matches),
                          kills:   Math.max(0, overall.kills   - sum.kills),
                          wins:    Math.max(0, overall.wins    - sum.wins) };
    out.complete = shapeOk && (anyMode || overall.matches === 0);
    return out;
  }

  function dominantMode(b){
    var best = 'other', max = 0;
    FN_MODES.forEach(function(m){ if(b[m].matches > max){ max = b[m].matches; best = m; } });
    return best;
  }

  function makeSegment(userKey, sessionKey, fromSnap, toSnap, liveAll){
    var fromRaw = fromSnap.byUser[userKey];
    var toRaw = toSnap ? toSnap.byUser[userKey] : liveAll;
    var fromTs = fromSnap.ts, toTs = toSnap ? toSnap.ts : null;
    return { key: userKey+'|'+sessionKey+'|'+fromTs+'|'+(toTs === null ? 'live' : toTs),
             sessionKey: sessionKey, fromTs: fromTs, toTs: toTs, raw: rawBuckets(fromRaw, toRaw) };
  }

  // Strict time window for a session: a start snapshot plus either a live pull
  // (single snapshot mode, end = null) or an end snapshot (range mode).
  // Returns null when there is no valid window, and nothing is scored then.
  function getWindowSnaps(sessionKey){
    var sess = state.fortniteSessions[sessionKey], w = sess.timeWindow;
    if(!w || typeof w.startTs !== 'number') return null;
    var sorted = sess.baselineHistory.slice().sort(function(a,b){ return a.ts - b.ts; });
    var start = sorted.filter(function(sn){ return sn.ts === w.startTs; })[0];
    if(!start) return null;
    var end = null;
    if(w.endTs != null){
      end = sorted.filter(function(sn){ return sn.ts === w.endTs; })[0] || null;
      if(!end || end.ts <= start.ts) return null;
    }
    var inRange = sorted.filter(function(sn){ return sn.ts >= start.ts && (!end || sn.ts <= end.ts); });
    return { start: start, end: end, snaps: inRange };
  }

  function windowLabel(win){
    var a = new Date(win.start.ts*1000).toLocaleString();
    return win.end ? a + ' → ' + new Date(win.end.ts*1000).toLocaleString() : a + ' → now (live)';
  }

  // Segments inside the window. null = no valid window (caller must prompt for a baseline).
  function getSegments(username, sessionKey){
    var win = getWindowSnaps(sessionKey);
    if(!win) return null;
    var userKey = username.toLowerCase();
    var c = fortniteCache[userKey];
    var liveAll = (c && c.statsAll) ? c.statsAll : null;
    var segs = [];
    win.snaps.forEach(function(sn, i){
      var next = win.snaps[i+1];
      if(next) segs.push(makeSegment(userKey, sessionKey, sn, next, null));
      else if(!win.end) segs.push(makeSegment(userKey, sessionKey, sn, null, liveAll)); // live tail, single snapshot mode only
    });
    return segs;
  }

  // Raw buckets + manual override -> effective buckets. Override takes precedence.
  function effectiveSegment(seg){
    var ov = state.fortniteOverrides[seg.key] || null;
    var eff = { raw: seg.raw, ov: ov, overridden: !!ov, buckets:{}, rawTotal: sumBuckets(seg.raw.buckets) };
    FN_BUCKETS.forEach(function(k){ eff.buckets[k] = clone(seg.raw.buckets[k]); });
    var countsSet = !!ov && (ov.matches != null || ov.kills != null || ov.wins != null);
    if(ov && (ov.mode || countsSet)){
      var fin = {
        matches: ov.matches != null ? ov.matches : eff.rawTotal.matches,
        kills:   ov.kills   != null ? ov.kills   : eff.rawTotal.kills,
        wins:    ov.wins    != null ? ov.wins    : eff.rawTotal.wins
      };
      var target = ov.mode || dominantMode(seg.raw.buckets);
      FN_BUCKETS.forEach(function(k){ eff.buckets[k] = zero(); });
      eff.buckets[target] = fin;
    }
    eff.incomplete = !seg.raw.complete && !(ov && (ov.mode || countsSet)); // an override resolves the gap
    return eff;
  }

  function scoreFortnitePlayer(username, sessionKey, filter){
    var tot = zero(), byMode = {}, entries = [], overridden = false, incomplete = false, missing = false;
    FN_BUCKETS.forEach(function(k){ byMode[k] = zero(); });
    var segs = getSegments(username, sessionKey);
    if(segs === null){
      return { needsBaseline: true, matches:0, kills:0, wins:0, points:0, overridden:false,
               incompleteModeData:false, hasMissing:false, empty:true, byMode:byMode, segments:[] };
    }
    segs.forEach(function(seg){
      var eff = effectiveSegment(seg);
      FN_BUCKETS.forEach(function(k){ addInto(byMode[k], eff.buckets[k]); });
      addInto(tot, filter === 'all' ? sumBuckets(eff.buckets) : eff.buckets[filter]);
      overridden = overridden || eff.overridden;
      incomplete = incomplete || eff.incomplete;
      missing = missing || (seg.raw.missing && !eff.overridden);
      entries.push({ seg: seg, eff: eff });
    });
    return {
      needsBaseline: false,
      matches: tot.matches, kills: tot.kills, wins: tot.wins,
      points: tot.kills * state.fortnitePoints.perKill + tot.wins * state.fortnitePoints.perWin,
      overridden: overridden, incompleteModeData: incomplete, hasMissing: missing,
      empty: !tot.matches && !tot.kills && !tot.wins,
      byMode: byMode, segments: entries
    };
  }

  // Effective score of one closed snapshot pair (used by the Battle Royale importers)
  function effectivePairScore(username, sessionKey, fromSnap, toSnap, filter){
    var eff = effectiveSegment(makeSegment(username.toLowerCase(), sessionKey, fromSnap, toSnap, null));
    var b = filter === 'all' ? sumBuckets(eff.buckets) : eff.buckets[filter];
    if(!b.matches && !b.kills && !b.wins) return null;
    return { kills:b.kills, matches:b.matches, wins:b.wins,
             placement: (eff.ov && eff.ov.placement != null) ? eff.ov.placement : null,
             points: b.kills * state.fortnitePoints.perKill + b.wins * state.fortnitePoints.perWin };
  }

  function modeBreakdownText(byMode){
    return FN_BUCKETS.filter(function(k){ var b = byMode[k]; return b.matches || b.kills || b.wins; })
      .map(function(k){
        var b = byMode[k];
        return (MODE_LABELS[k] || 'Other/LTM') + ': ' + b.matches + ' match' + (b.matches===1?'':'es') + ', ' +
          b.kills + ' kill' + (b.kills===1?'':'s') + (b.wins ? ', ' + b.wins + ' win' + (b.wins===1?'':'s') : '');
      });
  }
  // FN_ENGINE_END --------------------------------------------------------

  // ---------- Mode filter + manual override UI ----------
  function renderFnModeFilter(){
    var opts = [['all','All Modes'],['solo','Solo Only'],['duo','Duo Only'],['trio','Trio Only'],['squad','Squad Only']];
    return '<div class="field" style="max-width:240px;margin-bottom:14px;">' +
      '<label for="fnModeFilter">Game mode</label>' +
      '<select id="fnModeFilter" class="form-select">' +
      opts.map(function(o){
        return '<option value="'+o[0]+'"'+(state.fortniteModeFilter===o[0]?' selected':'')+'>'+o[1]+'</option>';
      }).join('') + '</select></div>';
  }

  function renderOverridePanel(entries){
    return '<div class="fn-ov-panel">' + entries.map(overrideRowHtml).join('') + '</div>';
  }

  function overrideRowHtml(entry){
    var seg = entry.seg, eff = entry.eff, ov = eff.ov || {}, rt = eff.rawTotal;
    var from = new Date(seg.fromTs*1000).toLocaleString();
    var to = seg.toTs ? new Date(seg.toTs*1000).toLocaleTimeString() : 'now (live)';
    var api = eff.raw.missing ? 'no API data for this span'
      : 'API says ' + rt.matches + ' matches · ' + rt.kills + ' kills · ' + rt.wins + ' wins';
    function v(x){ return x == null ? '' : x; }
    var modeOpts = '<option value="">Mode: as API</option>' + FN_MODES.map(function(m){
      return '<option value="'+m+'"'+(ov.mode===m?' selected':'')+'>Force '+MODE_LABELS[m]+'</option>';
    }).join('');
    return '<div class="fn-ov-seg" data-seg="'+escapeHtml(seg.key)+'">' +
      '<div class="fn-ov-head">'+escapeHtml(from)+' → '+escapeHtml(to)+' · '+api+(eff.overridden ? ' <span class="fn-ov-tag">[OVERRIDDEN]</span>' : '')+'</div>' +
      '<div class="inline">' +
        '<select class="form-select" data-ov="mode" aria-label="Mode override">'+modeOpts+'</select>' +
        '<input class="form-control" type="number" min="0" data-ov="matches" placeholder="Matches" aria-label="Custom matches" value="'+v(ov.matches)+'">' +
        '<input class="form-control" type="number" min="0" data-ov="kills" placeholder="Kills" aria-label="Custom kills" value="'+v(ov.kills)+'">' +
        '<input class="form-control" type="number" min="0" data-ov="wins" placeholder="Wins" aria-label="Custom wins" value="'+v(ov.wins)+'">' +
        '<input class="form-control" type="number" min="1" data-ov="placement" placeholder="Place" aria-label="Custom placement" value="'+v(ov.placement)+'">' +
      '</div>' +
      '<input class="form-control" type="text" data-ov="note" maxlength="120" placeholder="Reason (e.g. API missed a squad match)" value="'+escapeHtml(ov.note || '')+'">' +
      '<div class="util-row">' +
        '<button type="button" class="btn btn-accent" data-ov-save>Save override</button>' +
        '<button type="button" class="btn" data-ov-clear>Clear override</button>' +
      '</div>' +
      (ov.by ? '<div class="section-note">Set by '+escapeHtml(ov.by)+' · '+new Date(ov.at).toLocaleString()+'</div>' : '') +
    '</div>';
  }

  // null = nothing entered (treated as "clear")
  function readOverrideForm(segEl){
    function get(name){ var f = segEl.querySelector('[data-ov="'+name+'"]'); return f ? f.value.trim() : ''; }
    function toInt(str, min){ if(str === '') return null; var n = parseInt(str, 10); return (isNaN(n) || n < min) ? null : n; }
    var mode = get('mode');
    var ov = {
      mode: FN_MODES.indexOf(mode) !== -1 ? mode : null,
      matches: toInt(get('matches'), 0), kills: toInt(get('kills'), 0), wins: toInt(get('wins'), 0),
      placement: toInt(get('placement'), 1),
      note: get('note'),
      by: (document.getElementById('adminMenuName') || {}).textContent || 'admin',
      at: Date.now()
    };
    var any = ov.mode || ov.matches != null || ov.kills != null || ov.wins != null || ov.placement != null;
    return any ? ov : null;
  }

  // One delegated listener (renderLiveView replaces innerHTML, so per-render listeners would be lost)
  el.liveView.addEventListener('click', function(e){
    if(document.body.classList.contains('locked-view')) return; // admin only
    var t = e.target.closest('[data-ov-toggle],[data-ov-save],[data-ov-clear],[data-fn-capture]');
    if(!t) return;
    if(t.hasAttribute('data-fn-capture')){
      setFortniteBaseline(t.getAttribute('data-fn-capture'));
      return;
    }
    if(t.hasAttribute('data-ov-toggle')){
      var id = t.getAttribute('data-ov-toggle');
      fnOverrideOpen = (fnOverrideOpen === id) ? null : id;
      renderLiveView();
      return;
    }
    var segEl = t.closest('.fn-ov-seg');
    if(!segEl) return;
    var key = segEl.getAttribute('data-seg');
    if(t.hasAttribute('data-ov-clear')){
      delete state.fortniteOverrides[key];
      showToast('Override cleared. Back to raw API numbers.');
    } else {
      var ov = readOverrideForm(segEl);
      if(ov){ state.fortniteOverrides[key] = ov; showToast('Override saved.'); }
      else { delete state.fortniteOverrides[key]; showToast('Nothing entered, so no override was kept.'); }
    }
    persistState();
    renderLiveView();
  });
  var fnHistorySelectedPlayer = null;
  var fnHistoryDateFilter = ""; // 'YYYY-MM-DD' or '' for all days
  var fnHistoryShowResults = false;

  function renderFnSessionTable(sessionKey){
    var session = state.fortniteSessions[sessionKey];
    var win = getWindowSnaps(sessionKey);
    var filter = state.fortniteModeFilter;
    var canEdit = !document.body.classList.contains('locked-view');
    var modeName = filter === 'all' ? 'All modes' : MODE_LABELS[filter];

    // No valid time window = nothing is scored. There is no lifetime fallback.
    if(!win){
      return '<div class="section-label">'+session.label+' scoreboard · '+modeName+'</div>' +
        '<div class="fn-baseline-prompt">' +
          '<div class="fn-baseline-title">Set a session baseline to track live points.</div>' +
          '<div class="section-note">Points only count what happens inside a time window that starts at a captured snapshot.</div>' +
          (canEdit ? '<button type="button" class="btn btn-accent" data-fn-capture="'+sessionKey+'">Capture '+session.label+' baseline now</button>' : '') +
        '</div>';
    }

    var rows = state.fortniteUsers.map(function(u){
      var c = fortniteCache[u.username.toLowerCase()];
      return { user:u, cache:c, score: scoreFortnitePlayer(u.username, sessionKey, filter) };
    });
    rows.sort(function(a,b){ return b.score.points - a.score.points; });

    var html = '<div class="section-label">'+session.label+' scoreboard · '+modeName+' · window: '+windowLabel(win)+' · '+state.fortnitePoints.perKill+' pt/kill, '+state.fortnitePoints.perWin+' pt/win</div>';
    html += '<table class="standings" style="margin-bottom:8px;"><thead><tr>' +
      '<th class="num">#</th><th>Player</th><th class="num">Matches</th><th class="num">Kills</th><th class="num">Wins</th><th class="num">Points</th><th class="num">Updated</th></tr></thead><tbody>';
    rows.forEach(function(r, i){
      var u = r.user, sc = r.score, panelId = 'p|' + u.username.toLowerCase() + '|' + sessionKey;
      if(!r.cache){
        html += '<tr><td class="num rank-badge">'+(i+1)+'</td><td>'+escapeHtml(u.username)+'</td><td colspan="5" style="text-align:center;color:var(--muted);">Loading…</td></tr>';
        return;
      }
      var tags = '';
      if(sc.overridden) tags += ' <span class="fn-ov-tag">[OVERRIDDEN]</span>';
      // An API failure no longer blanks the row: closed segments and overrides still score.
      if(r.cache.error && !win.end) tags += ' <span class="fn-warn" title="'+escapeHtml(r.cache.error)+'">⚠ live data unavailable</span>';
      if(filter !== 'all' && sc.incompleteModeData) tags += ' <span class="fn-warn" title="The API gave no usable mode breakdown for part of this window. Use the pencil to assign it.">⚠ mode data incomplete</span>';
      var edit = canEdit ? ' <button type="button" class="btn-danger-text" data-ov-toggle="'+escapeHtml(panelId)+'" title="Manual override" aria-label="Manual override for '+escapeHtml(u.username)+'">✎</button>' : '';

      html += '<tr class="'+(i===0 && sc.points>0 ? 'rank-1' : '')+'">' +
        '<td class="num rank-badge">'+(i+1)+'</td>' +
        '<td>'+escapeHtml(u.username)+tags+edit+'</td>' +
        '<td class="num">'+sc.matches+'</td><td class="num">'+sc.kills+'</td><td class="num">'+sc.wins+'</td>' +
        '<td class="num br-pts">'+sc.points+'</td>' +
        '<td class="num" style="font-size:0.76rem;color:var(--muted);">'+(r.cache.fetchedAt ? timeAgo(r.cache.fetchedAt) : '—')+'</td></tr>';

      var notes = [];
      if(sc.empty){
        notes.push(filter === 'all'
          ? '0 matches / 0 pts in this window.'
          : 'No matches recorded in ' + MODE_LABELS[filter] + ' mode: 0 matches / 0 pts in this window.');
      } else if(filter === 'all'){
        notes.push(modeBreakdownText(sc.byMode).join(' &nbsp;·&nbsp; '));
      }
      if(sc.hasMissing) notes.push('No snapshot data for this player in this window. Use the pencil to enter their numbers, or capture a new baseline.');
      if(notes.length) html += '<tr><td></td><td colspan="6" style="font-size:0.74rem;color:var(--muted);padding-top:0;">'+notes.join('<br>')+'</td></tr>';
      if(canEdit && fnOverrideOpen === panelId){
        html += '<tr><td></td><td colspan="6">'+renderOverridePanel(sc.segments)+'</td></tr>';
      }
    });
    html += '</tbody></table>';
    html += '<div class="section-note">Counts only match activity inside this window ('+(win.end ? 'start snapshot → end snapshot' : 'start snapshot → current live pull')+'). The line under each player shows which queue it came from.</div>';
    html += '<div class="util-row" style="margin:10px 0 8px;">' +
      '<button class="btn btn-accent" data-import-session="'+sessionKey+'">Import this as one game</button>' +
      '<button class="btn" data-import-history="'+sessionKey+'">Import full game history</button>' +
    '</div>';
    if(win.snaps.length < 2){
      html += '<div class="section-note" style="margin-bottom:24px;">"Import full game history" needs at least 2 snapshots inside the window. Capture one before and after each game and it will rebuild each one as its own game.</div>';
    } else {
      html += '<div style="margin-bottom:24px;"></div>';
    }
    return html;
  }

  function renderFortniteScoreboard(){
    if(document.body.classList.contains('locked-view') && (state.fortniteUsers.length === 0 || !state.fortniteApiKey)){
      return '<div class="empty-note">There is no match at the moment.</div>';
    }
    if(state.fortniteUsers.length === 0){
      return '<div class="empty-note">Track an Epic username in the sidebar to pull their stats.</div>';
    }
    if(!state.fortniteApiKey){
      return '<div class="section-note">Add a free Fortnite-API.com key in the sidebar (fortnite-api.com/profile), then generate the bracket or capture a session baseline to start tracking live points.</div>';
    }
    return renderFnModeFilter() + renderFnSessionTable('build') + renderFnSessionTable('nobuild') + renderFortniteMatchHistory();
  }

  // Reconstructs one player's individual games (across both Build and No
  // Build sessions) from consecutive snapshot pairs — read-only, doesn't
  // touch the tournament, just for browsing what actually happened.
  function computePlayerGameHistory(username, dateFilter){
    var userKey = username.toLowerCase(), filter = state.fortniteModeFilter, games = [];
    ['build','nobuild'].forEach(function(sk){
      var session = state.fortniteSessions[sk];
      var snaps = session.baselineHistory.slice().sort(function(a,b){ return a.ts - b.ts; });
      for(var i=0; i<snaps.length-1; i++){
        if(dateFilter && dayKeyLocal(snaps[i].ts) !== dateFilter && dayKeyLocal(snaps[i+1].ts) !== dateFilter) continue;
        var seg = makeSegment(userKey, sk, snaps[i], snaps[i+1], null);
        var eff = effectiveSegment(seg);
        var b = filter === 'all' ? sumBuckets(eff.buckets) : eff.buckets[filter];
        if(!b.matches && !b.kills && !b.wins) continue; // nothing in this mode
        games.push({
          sessionLabel: session.label, seg: seg, eff: eff, fromTs: seg.fromTs, toTs: seg.toTs,
          matches: b.matches, kills: b.kills, wins: b.wins,
          points: b.kills * state.fortnitePoints.perKill + b.wins * state.fortnitePoints.perWin,
          modeBreakdown: modeBreakdownText(eff.buckets)
        });
      }
    });
    games.sort(function(a,b){ return b.toTs - a.toTs; }); // most recent first
    return games;
  }

  // 'YYYY-MM-DD' for a unix timestamp, in the viewer's local time zone —
  // matches what a <input type="date"> field returns.
  function dayKeyLocal(ts){
    var d = new Date(ts*1000);
    var pad = function(n){ return n < 10 ? '0'+n : ''+n; };
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
  }

  function renderFortniteMatchHistory(){
    var options = '<option value="">Select a player…</option>' + state.fortniteUsers.map(function(u){
      return '<option value="'+escapeHtml(u.username)+'"'+(fnHistorySelectedPlayer===u.username?' selected':'')+'>'+escapeHtml(u.username)+'</option>';
    }).join('');
    var html = '<div class="section-label" style="margin-top:10px;">Match history</div>';
    html += '<div class="add-row" style="margin-bottom:14px;">';
    html += '<select id="fnHistoryPlayerSelect" class="form-select">'+options+'</select>';
    html += '<div class="inline"><input id="fnHistoryDateInput" type="date" class="form-control" value="'+fnHistoryDateFilter+'" title="Optional: only show matches from this day"></div>';
    html += '<button class="btn btn-accent btn-full" id="fnHistoryShowBtn">Show matches</button>';
    html += '</div>';

    if(!fnHistorySelectedPlayer){
      html += '<div class="empty-note">Pick a player above, optionally a day, then click "Show matches".</div>';
      return html;
    }
    if(!fnHistoryShowResults){
      // Kept clean on purpose — nothing renders until you explicitly ask for it.
      return html;
    }

    var games = computePlayerGameHistory(fnHistorySelectedPlayer, fnHistoryDateFilter || null);
    var canEditHist = !document.body.classList.contains('locked-view');
    if(games.length === 0){
      var modeMsg = state.fortniteModeFilter !== 'all'
        ? 'No matches recorded in '+MODE_LABELS[state.fortniteModeFilter]+' mode for '+escapeHtml(fnHistorySelectedPlayer)+(fnHistoryDateFilter ? ' on '+fnHistoryDateFilter : '')+'.'
        : 'No matches found for '+escapeHtml(fnHistorySelectedPlayer)+(fnHistoryDateFilter ? ' on '+fnHistoryDateFilter : '')+'. Take at least 2 snapshots (Build or No Build) while they\'re tracked to build history.';
      html += '<div class="empty-note">'+modeMsg+'</div>';
      return html;
    }

    html += '<div class="fn-history-list">';
    games.forEach(function(g){
      var modeText = g.modeBreakdown.length
        ? g.modeBreakdown.join(' &nbsp;·&nbsp; ')
        : 'Mode breakdown unavailable for this pair of snapshots';
      var gid = 'g|' + g.seg.key;
      html += '<div class="fn-history-item">' +
        '<div class="fn-history-top"><strong>'+escapeHtml(g.sessionLabel)+'</strong>' +
          (g.eff.overridden ? ' <span class="fn-ov-tag">[OVERRIDDEN]</span>' : '') +
          (state.fortniteModeFilter !== 'all' && g.eff.incomplete ? ' <span class="fn-warn">⚠ mode data incomplete</span>' : '') +
          '<span class="live-status" style="margin:0;">'+new Date(g.fromTs*1000).toLocaleString()+' → '+new Date(g.toTs*1000).toLocaleTimeString()+'</span>' +
          (canEditHist ? ' <button type="button" class="btn-danger-text" data-ov-toggle="'+escapeHtml(gid)+'" title="Manual override" aria-label="Manual override for this game">✎</button>' : '') +
        '</div>' +
        '<div class="fn-history-stats">'+g.matches+' match'+(g.matches===1?'':'es')+' · '+g.kills+' kills · '+g.wins+' win'+(g.wins===1?'':'s')+' · '+g.points+' pts</div>' +
        '<div class="fn-history-modes">'+modeText+'</div>' +
        (canEditHist && fnOverrideOpen === gid ? renderOverridePanel([{ seg: g.seg, eff: g.eff }]) : '') +
      '</div>';
    });
    html += '</div>';
    html += '<button class="btn" id="fnHistoryHideBtn" style="margin-bottom:24px;">Hide matches</button>';
    return html;
  }

  // Turns a Fortnite tracking session's pulled stats (since its selected
  // baseline) into a real Battle Royale game entry: creates/matches teams
  // by name, ranks players by points into placements, and uses kills as
  // elims — so the pulled data shows up in the same tournament leaderboard
  // as manually-entered games.
  // Finds an existing team matching this Epic username by name, or creates
  // one — preferring a linked profile's name/color if one exists, so
  // imported players automatically pick up their profile identity.
  function findOrCreateTeamForPlayer(username, colorIndexFallback){
    var team = state.teams.filter(function(t){ return t.name.toLowerCase() === username.toLowerCase(); })[0];
    if(team) return team;
    var matchingProfile = state.profiles.filter(function(p){ return p.epicUsername && p.epicUsername.toLowerCase() === username.toLowerCase(); })[0];
    var name = matchingProfile ? matchingProfile.name : username;
    var color = matchingProfile ? matchingProfile.color : PALETTE[colorIndexFallback % PALETTE.length];
    // Also check by the profile's own name in case a team already exists under it
    team = state.teams.filter(function(t){ return t.name.toLowerCase() === name.toLowerCase(); })[0];
    if(team) return team;
    team = { id: nextId(), name: name, host: "", color: color };
    state.teams.push(team);
    return team;
  }

  function createBRGameFromResults(results, label){
    results.sort(function(a,b){ return b.points - a.points; });
    var entries = {};
    results.forEach(function(r, i){
      var team = findOrCreateTeamForPlayer(r.username, i);
      entries[team.id] = { placement: (r.placement != null ? r.placement : i+1), elims: r.kills };
    });
    state.brGames.push({ id: 'g'+(brGameUid++), entries: entries, label: label });
  }

  function importFortniteSessionToBR(sessionKey){
    var session = state.fortniteSessions[sessionKey];
    var win = getWindowSnaps(sessionKey);
    if(!win){
      showToast('Set a session baseline first.', true);
      return;
    }

    var results = [];
    state.fortniteUsers.forEach(function(u){
      var sc = scoreFortnitePlayer(u.username, sessionKey, state.fortniteModeFilter);
      if(!sc.empty) results.push({ username: u.username, kills: sc.kills, matches: sc.matches, wins: sc.wins, points: sc.points, placement: null });
    });

    if(results.length === 0){
      showToast("No players have recorded activity in this window yet, so there is nothing to import.", true);
      return;
    }

    if(state.format !== 'br'){ setFormat('br'); }
    var label = session.label + ' (' + windowLabel(win) + ')';
    createBRGameFromResults(results, label);

    renderTeamList();
    renderBR();
    switchView('main');
    persistState();
    showToast('Imported ' + results.length + ' player' + (results.length===1?'':'s') + ' into a new Battle Royale game.');
  }

  // Reconstructs a full per-game history from every pair of consecutive
  // snapshots you've taken in this session — each gap between two snapshots
  // becomes its own separate Battle Royale game, instead of one lump total.
  function importAllFortniteGamesToBR(sessionKey){
    var session = state.fortniteSessions[sessionKey];
    var win = getWindowSnaps(sessionKey);
    if(!win){
      showToast('Set a session baseline first.', true);
      return;
    }
    var snaps = win.snaps; // only snapshot pairs inside the active window
    if(snaps.length < 2){
      showToast('Take at least 2 snapshots inside the window to reconstruct individual games. Each snapshot marks the boundary between one game and the next.', true);
      return;
    }

    if(state.format !== 'br'){ setFormat('br'); }

    var gamesCreated = 0;
    for(var i=0; i<snaps.length-1; i++){
      var fromSnap = snaps[i], toSnap = snaps[i+1];
      var results = [];
      state.fortniteUsers.forEach(function(u){
        var d = effectivePairScore(u.username, sessionKey, fromSnap, toSnap, state.fortniteModeFilter);
        if(d) results.push({ username: u.username, kills: d.kills, matches: d.matches, wins: d.wins, points: d.points, placement: d.placement });
      });
      if(results.length === 0) continue;
      var label = session.label + ' · ' + new Date(fromSnap.ts*1000).toLocaleTimeString() + '–' + new Date(toSnap.ts*1000).toLocaleTimeString();
      createBRGameFromResults(results, label);
      gamesCreated++;
    }

    renderTeamList();
    renderBR();
    switchView('main');
    persistState();
    if(gamesCreated === 0){
      showToast('No activity found between any of your snapshots — nothing to import.', true);
    } else {
      showToast('Imported ' + gamesCreated + ' game' + (gamesCreated===1?'':'s') + ' from your snapshot history.');
    }
  }

  // ---------- Tournament scoring by time control ----------
  el.applyTcBtn.addEventListener('click', applyTournamentScoring);

  function applyTournamentScoring(){
    var base = parseInt(el.tcBase.value, 10) || 600;
    var incr = Math.max(0, parseInt(el.tcIncrement.value, 10) || 0);
    var sinceVal = el.tcSince.value;
    var sinceTs = sinceVal ? Math.floor(new Date(sinceVal).getTime()/1000) : null;
    state.trackTC = { base: base, increment: incr, sinceTs: sinceTs };
    fetchAllTC(true);
    persistState();
  }

  function fetchTCGames(username){
    var key = username.toLowerCase();
    var base = state.trackTC.base, incr = state.trackTC.increment;
    tcCache[key] = tcCache[key] || {};
    tcCache[key].loading = true;
    return fetch('https://api.chess.com/pub/player/'+encodeURIComponent(key)+'/games/live/'+base+'/'+incr)
      .then(function(r){ if(!r.ok) throw new Error('status'); return r.json(); })
      .then(function(d){ tcCache[key] = { loading:false, games: d.games || [] }; })
      .catch(function(){ tcCache[key] = { loading:false, error: "Couldn't load — Chess.com may be blocking requests from this page, or no games exist at this time control." }; });
  }

  function fetchAllTC(rerender){
    var users = state.watchUsers.slice();
    var chain = Promise.resolve();
    users.forEach(function(u){
      chain = chain.then(function(){ return fetchTCGames(u.username); });
    });
    return chain.then(function(){
      renderProfileList();
      if(rerender && state.view === 'live'){ renderLiveView(); }
    });
  }

  function computeTCRecord(username){
    var key = username.toLowerCase();
    var c = tcCache[key];
    if(!c || c.loading || c.error) return null;
    var games = c.games || [];
    if(state.trackTC.sinceTs){
      games = games.filter(function(g){ return (g.end_time||0) >= state.trackTC.sinceTs; });
    }
    var w=0,d=0,l=0,pts=0;
    games.forEach(function(g){
      var isWhite = g.white && g.white.username && g.white.username.toLowerCase() === key;
      var side = isWhite ? g.white : g.black;
      if(!side) return;
      var cls = resultClass(side.result);
      if(cls === 'win'){ w++; pts += 1; }
      else if(cls === 'draw'){ d++; pts += 0.5; }
      else { l++; }
    });
    return { games: games.length, w:w, d:d, l:l, pts:pts };
  }

  function renderScoreboard(){
    if(state.watchUsers.length === 0) return '';
    var base = state.trackTC.base, incr = state.trackTC.increment;
    var baseMin = Math.round(base/60);
    var anyLoaded = state.watchUsers.some(function(u){ return tcCache[u.username.toLowerCase()]; });
    if(!anyLoaded){
      return '<div class="section-note" style="margin-bottom:20px;">Click "Apply &amp; pull scores" in the sidebar to build a scoreboard for '+baseMin+'|'+incr+' games.</div>';
    }
    var rows = state.watchUsers.map(function(u){
      var key = u.username.toLowerCase();
      var c = tcCache[key];
      var rec = computeTCRecord(u.username);
      return { user: u, cache: c, rec: rec };
    });
    rows.sort(function(a,b){
      var pa = a.rec ? a.rec.pts : -1, pb = b.rec ? b.rec.pts : -1;
      return pb - pa;
    });
    var html = '<table class="standings" style="margin-bottom:28px;"><thead><tr>' +
      '<th class="num">#</th><th>Player</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">Games</th><th class="num">Score</th></tr></thead><tbody>';
    rows.forEach(function(r, i){
      if(!r.cache || r.cache.loading){
        html += '<tr><td class="num rank-badge">'+(i+1)+'</td><td>'+escapeHtml(r.user.username)+'</td><td class="num" colspan="5" style="text-align:center;color:var(--muted);">Loading…</td></tr>';
      } else if(r.cache.error){
        html += '<tr><td class="num rank-badge">'+(i+1)+'</td><td>'+escapeHtml(r.user.username)+'</td><td colspan="5" style="color:var(--lose);font-size:0.8rem;">'+escapeHtml(r.cache.error)+'</td></tr>';
      } else {
        html += '<tr class="'+(i===0 && r.rec.games>0 ? 'rank-1':'')+'">' +
          '<td class="num rank-badge">'+(i+1)+'</td>' +
          '<td>'+escapeHtml(r.user.username)+'</td>' +
          '<td class="num">'+r.rec.w+'</td><td class="num">'+r.rec.d+'</td><td class="num">'+r.rec.l+'</td>' +
          '<td class="num">'+r.rec.games+'</td><td class="num br-pts">'+r.rec.pts+'</td></tr>';
      }
    });
    html += '</tbody></table>';
    return '<div class="section-label">Scoreboard · '+baseMin+'|'+incr+' games'+(state.trackTC.sinceTs ? ' since '+new Date(state.trackTC.sinceTs*1000).toLocaleString() : '')+'</div>' + html;
  }

  function collectTCMatches(){
    var seen = {};
    var matches = [];
    state.watchUsers.forEach(function(u){
      var key = u.username.toLowerCase();
      var c = tcCache[key];
      if(!c || c.loading || c.error) return;
      var games = c.games || [];
      if(state.trackTC.sinceTs){
        games = games.filter(function(g){ return (g.end_time||0) >= state.trackTC.sinceTs; });
      }
      games.forEach(function(g){
        if(seen[g.url]) return;
        seen[g.url] = true;
        matches.push(g);
      });
    });
    matches.sort(function(a,b){ return (b.end_time||0) - (a.end_time||0); });
    return matches;
  }

  function renderTCMatchList(){
    var anyLoaded = state.watchUsers.some(function(u){ return tcCache[u.username.toLowerCase()]; });
    if(!anyLoaded) return '';
    var matches = collectTCMatches();
    if(matches.length === 0){
      return '<div class="empty-note" style="margin-bottom:24px;">No finished games at this time control yet'+(state.trackTC.sinceTs ? ' since your cutoff time' : '')+'.</div>';
    }
    var html = '<div class="section-label">Matches (' + matches.length + ')</div><div class="fixture-grid" style="margin-bottom:28px;">';
    matches.forEach(function(g){
      var whiteName = g.white && g.white.username || '?';
      var blackName = g.black && g.black.username || '?';
      var scoreTxt = (g.white && g.white.result === 'win') ? '1–0' : ((g.black && g.black.result === 'win') ? '0–1' : '½–½');
      html += '<a class="fixture" href="'+g.url+'" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;flex-direction:column;align-items:stretch;gap:6px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div class="side"><span>'+escapeHtml(whiteName)+'</span></div>' +
          '<span class="vs" style="font-weight:700;">'+scoreTxt+'</span>' +
          '<div class="side" style="justify-content:flex-end;text-align:right;"><span>'+escapeHtml(blackName)+'</span></div>' +
        '</div>' +
        '<div class="live-status" style="margin:0;">'+escapeHtml(labelTimeClass(g.time_class))+' · '+timeAgo(g.end_time||0)+'</div>' +
      '</a>';
    });
    html += '</div>';
    return html;
  }

  function setupAutoRefresh(){
    if(autoRefreshTimer){ clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
    if(el.autoRefreshChk.checked){
      autoRefreshTimer = setInterval(function(){ fetchAllTC(true); }, 45000);
    }
  }

  function resultClass(code){
    if(code === 'win') return 'win';
    if(['agreed','repetition','stalemate','insufficient','50move','timevsinsufficient'].indexOf(code) !== -1) return 'draw';
    return 'loss';
  }

  var TIME_CLASS_LABELS = { daily: 'Daily', rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet' };
  function labelTimeClass(tc){
    return TIME_CLASS_LABELS[tc] || (tc || 'Game');
  }

  function timeAgo(ts){
    var secs = Math.max(0, Math.floor(Date.now()/1000) - ts);
    if(secs < 60) return 'just now';
    if(secs < 3600) return Math.floor(secs/60) + 'm ago';
    if(secs < 86400) return Math.floor(secs/3600) + 'h ago';
    return Math.floor(secs/86400) + 'd ago';
  }

  function renderLiveView(){
    if(state.game === 'fortnite'){
      el.liveView.innerHTML = renderFortniteScoreboard();
      el.liveView.querySelectorAll('[data-import-session]').forEach(function(btn){
        btn.addEventListener('click', function(){ importFortniteSessionToBR(btn.dataset.importSession); });
      });
      el.liveView.querySelectorAll('[data-import-history]').forEach(function(btn){
        btn.addEventListener('click', function(){ importAllFortniteGamesToBR(btn.dataset.importHistory); });
      });
      var modeSel = el.liveView.querySelector('#fnModeFilter');
      if(modeSel){
        modeSel.addEventListener('change', function(){
          state.fortniteModeFilter = modeSel.value;
          el.fnGenMode.value = state.fortniteModeFilter;
          fnHistoryShowResults = false;
          if(!document.body.classList.contains('locked-view')) persistState(); // viewers can't change shared state
          renderLiveView();
        });
      }
      var histSelect = el.liveView.querySelector('#fnHistoryPlayerSelect');
      if(histSelect){
        histSelect.addEventListener('change', function(){
          fnHistorySelectedPlayer = histSelect.value || null;
          fnHistoryShowResults = false; // keep it clean — require an explicit "Show matches" click again
          renderLiveView();
        });
      }
      var histDateInput = el.liveView.querySelector('#fnHistoryDateInput');
      if(histDateInput){
        histDateInput.addEventListener('change', function(){
          fnHistoryDateFilter = histDateInput.value || "";
          fnHistoryShowResults = false;
          renderLiveView();
        });
      }
      var histShowBtn = el.liveView.querySelector('#fnHistoryShowBtn');
      if(histShowBtn){
        histShowBtn.addEventListener('click', function(){
          if(!fnHistorySelectedPlayer){ showToast('Pick a player first.', true); return; }
          fnHistoryShowResults = true;
          renderLiveView();
        });
      }
      var histHideBtn = el.liveView.querySelector('#fnHistoryHideBtn');
      if(histHideBtn){
        histHideBtn.addEventListener('click', function(){
          fnHistoryShowResults = false;
          renderLiveView();
        });
      }
      return;
    }
    if(state.game === 'chess'){
      if(state.watchUsers.length === 0){
        el.liveView.innerHTML = document.body.classList.contains('locked-view')
          ? '<div class="empty-note">There is no match at the moment.</div>'
          : '<div class="empty-note">Track a Chess.com username in the sidebar, then apply a time control to build a scoreboard.</div>';
        return;
      }
      el.liveView.innerHTML = renderScoreboard() + renderTCMatchList();
      return;
    }
    // General mode has no live/Scores concept — this shouldn't normally be
    // reachable (the Scores tab is hidden in General), but guard it anyway.
    el.liveView.innerHTML = '<div class="empty-note">Scores are only available in Fortnite or Chess mode. Switch Game above, or use the Bracket/Standings view for General tournaments.</div>';
  }


  // ---------- Present mode ----------
  el.presentBtn.addEventListener('click', function(){
    persistState();
    var hasLiveSection = state.game === 'fortnite' || state.game === 'chess';
    var w = null;
    if(storageAvailable){
      var url = location.href.split('#')[0] + (hasLiveSection ? '#present-live' : '#present');
      try{ w = window.open(url, '_blank'); }catch(e){ w = null; }
    }
    if(!w){
      // Couldn't open a separate synced tab — present right here instead,
      // so you're never left with nothing.
      if(hasLiveSection){ switchView('live'); }
      document.body.classList.add('present');
    }
    // If a new tab did open, this tab is untouched — still on whatever view
    // you had, still fully editable — while the new tab presents, read-only.
  });
  el.exitPresentBtn.addEventListener('click', function(){
    if(document.body.classList.contains('locked-view')) return;
    document.body.classList.remove('present');
  });

  // Keep a presentation tab live-synced with whatever changes in the main tab,
  // using the storage event that fires automatically in *other* tabs when localStorage changes.
  window.addEventListener('storage', function(e){
    if(e.key !== STORAGE_KEY || !e.newValue) return;
    try{
      state = JSON.parse(e.newValue);
      normalizeState();
      renderTeamList();
      renderChessUserList();
      renderFnUserList();
      renderHeader();
      renderBracket();
      renderStandings();
      renderBR();

      // Re-apply which game mode's tools/tabs are visible, and which content
      // section is shown — otherwise a format/game switch in the main tab can
      // update the data in a hidden div while a stale, empty view stays shown here.
      el.gameGeneral.classList.toggle('active', state.game==='general');
      el.gameFortnite.classList.toggle('active', state.game==='fortnite');
      el.gameChess.classList.toggle('active', state.game==='chess');
      el.teamToolsSection.style.display = state.game === 'chess' ? 'none' : '';
      el.fortniteToolsSection.style.display = state.game === 'fortnite' ? '' : 'none';
      el.fnGenSetup.style.display = state.game === 'fortnite' ? '' : 'none';
      el.startBtn.textContent = state.game === 'fortnite' ? 'Generate bracket & start window' : 'Generate bracket';
      el.fnGenMode.value = state.fortniteModeFilter;
      renderFnSnapshotSelect();
      el.chessToolsSection.style.display = state.game === 'chess' ? '' : 'none';
      el.tabMain.style.display = state.game === 'chess' ? 'none' : '';
      el.tabLive.style.display = state.game === 'general' ? 'none' : '';
      el.fmtElim.classList.toggle('active', state.format === 'elim');
      el.fmtRR.classList.toggle('active', state.format === 'rr');
      el.fmtBR.classList.toggle('active', state.format === 'br');
      switchView(forcedPresentView || state.view);
    }catch(err){ console.error('Could not sync from other tab:', err); }
  });
  document.addEventListener('click', function(e){
    if(openProfileMenuId && !e.target.closest('.profile-menu-wrap')){
      openProfileMenuId = null;
      renderProfileList();
    }
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      if(!document.body.classList.contains('locked-view')){
        document.body.classList.remove('present');
      }
      closeProfilesPanel();
    }
  });

  // ---------- Autosave (localStorage, with graceful fallback) ----------
  var STORAGE_KEY = 'bracket_room_state_v1';
  var storageAvailable = false;
  try{
    window.localStorage.setItem('__br_test__','1');
    window.localStorage.removeItem('__br_test__');
    storageAvailable = true;
  }catch(e){ storageAvailable = false; }

  function persistState(){
    if(!storageAvailable) return;
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }

  function loadPersistedState(){
    if(!storageAvailable) return null;
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }

  function repairAndResyncIds(){
    function fix(arr, prefix){
      if(!Array.isArray(arr)) return 0;
      var maxN = 0;
      arr.forEach(function(item){
        if(item && typeof item.id === 'string' && item.id.indexOf(prefix) === 0){
          var n = parseInt(item.id.slice(prefix.length), 10);
          if(!isNaN(n) && n > maxN) maxN = n;
        }
      });
      var nextN = maxN + 1;
      var seen = {};
      arr.forEach(function(item){
        if(!item) return;
        if(!item.id || seen[item.id]){
          item.id = prefix + (nextN++);
        }
        seen[item.id] = true;
      });
      return nextN;
    }
    uid = Math.max(uid, fix(state.teams, 't'));
    profileUid = Math.max(profileUid, fix(state.profiles, 'p'));
    chessUserUid = Math.max(chessUserUid, fix(state.watchUsers, 'c'));
    fnUserUid = Math.max(fnUserUid, fix(state.fortniteUsers, 'f'));
    brGameUid = Math.max(brGameUid, fix(state.brGames, 'g'));
  }

  function normalizeState(){
    if(typeof state.matchTimeLimit !== 'string') state.matchTimeLimit = "";
    if(!state.profiles) state.profiles = [];
    if(!state.brGames) state.brGames = [];
    if(typeof state.brElimPoints !== 'number') state.brElimPoints = 1;
    if(!state.watchUsers) state.watchUsers = [];
    if(!state.trackTC) state.trackTC = { base:600, increment:0, sinceTs:null };
    if(!state.game) state.game = 'general';
    if(!state.fortniteUsers) state.fortniteUsers = [];

    var defaultSession = function(label){ return { label: label, baselineHistory: [], timeWindow: { startTs: null, endTs: null } }; };
    if(!state.fortniteSessions || typeof state.fortniteSessions !== 'object'){
      state.fortniteSessions = { build: defaultSession('Build'), nobuild: defaultSession('No Build') };
    } else {
      ['build','nobuild'].forEach(function(key){
        var label = key === 'build' ? 'Build' : 'No Build';
        var s = state.fortniteSessions[key];
        if(!s || typeof s !== 'object'){ state.fortniteSessions[key] = defaultSession(label); return; }
        if(typeof s.label !== 'string') s.label = label;
        if(!Array.isArray(s.baselineHistory)) s.baselineHistory = [];
        // repair any snapshot entries that don't look like {ts, byUser}
        s.baselineHistory = s.baselineHistory.filter(function(snap){
          return snap && typeof snap.ts === 'number' && snap.byUser && typeof snap.byUser === 'object';
        });
        // Strict time window: start snapshot (+ optional end snapshot). Both must exist in
        // baselineHistory and end must be after start, otherwise the window is cleared.
        if(!s.timeWindow || typeof s.timeWindow !== 'object') s.timeWindow = { startTs: null, endTs: null };
        if(typeof s.selectedTs === 'number' && s.timeWindow.startTs == null) s.timeWindow.startTs = s.selectedTs; // legacy files
        delete s.selectedTs;
        var hasSnap = function(ts){ return typeof ts === 'number' && s.baselineHistory.some(function(sn){ return sn.ts === ts; }); };
        if(!hasSnap(s.timeWindow.startTs)){ s.timeWindow.startTs = null; s.timeWindow.endTs = null; }
        if(s.timeWindow.endTs != null && (!hasSnap(s.timeWindow.endTs) || s.timeWindow.endTs <= s.timeWindow.startTs)) s.timeWindow.endTs = null;
      });
    }

    if(state.fortniteActiveSession !== 'build' && state.fortniteActiveSession !== 'nobuild'){
      state.fortniteActiveSession = 'build';
    }
    if(typeof state.fortniteApiKey !== 'string') state.fortniteApiKey = "";
    if(!state.fortnitePoints || typeof state.fortnitePoints.perKill !== 'number' || typeof state.fortnitePoints.perWin !== 'number'){
      state.fortnitePoints = { perKill: 1, perWin: 5 };
    }
    if(['all','solo','duo','trio','squad'].indexOf(state.fortniteModeFilter) === -1) state.fortniteModeFilter = 'all';
    if(!state.fortniteOverrides || typeof state.fortniteOverrides !== 'object' || Array.isArray(state.fortniteOverrides)) state.fortniteOverrides = {};
    Object.keys(state.fortniteOverrides).forEach(function(k){
      if(k.split('|')[2] === '0') delete state.fortniteOverrides[k]; // overrides from the removed lifetime view
    });
    repairAndResyncIds();
  }

  function syncUiFromState(){
    el.tourneyName.value = state.name || "Untitled Tournament";
    el.matchTimeLimit.value = state.matchTimeLimit || "";
    el.fmtElim.classList.toggle('active', state.format === 'elim');
    el.fmtRR.classList.toggle('active', state.format === 'rr');
    el.fmtBR.classList.toggle('active', state.format === 'br');
    el.fnApiKey.value = state.fortniteApiKey;
    el.fnPtsKill.value = state.fortnitePoints.perKill;
    el.fnPtsWin.value = state.fortnitePoints.perWin;
    el.fnGenMode.value = state.fortniteModeFilter;
    setFnSession(state.fortniteActiveSession);
    setGame(state.game);
  }

  // ---------- Export / Import ----------
  el.exportBtn.addEventListener('click', function(){
    var blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (state.name || 'tournament').replace(/[^a-z0-9]+/gi,'_').toLowerCase() + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  el.importBtn.addEventListener('click', function(){ el.importFile.click(); });
  el.importFile.addEventListener('change', function(){
    var file = el.importFile.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      try{
        state = JSON.parse(reader.result);
        normalizeState();
        tcCache = {};
        fortniteCache = {};
        syncUiFromState();
        renderAll();
        fetchAllTC(true);
        refreshFortniteStats(true);
        persistState();
      }catch(err){
        showToast("Couldn't read that file — make sure it's a Bracket Room export.", true);
      }
    };
    reader.readAsText(file);
    el.importFile.value = "";
  });

  el.resetBtn.addEventListener('click', function(){
    confirmOnClick(el.resetBtn, function(){
      state = { name:"Untitled Tournament", matchTimeLimit:"", profiles:[], game:"general", format:"elim", teams:[], rounds:[], rrMatches:[], brGames:[], brElimPoints:1, watchUsers:[], trackTC:{base:600,increment:0,sinceTs:null}, fortniteApiKey:"", fortniteUsers:[], fortniteSessions:{build:{label:"Build",baselineHistory:[],timeWindow:{startTs:null,endTs:null}},nobuild:{label:"No Build",baselineHistory:[],timeWindow:{startTs:null,endTs:null}}}, fortniteActiveSession:"build", fortnitePoints:{perKill:1,perWin:5}, fortniteModeFilter:"all", fortniteOverrides:{}, view:"main", started:false };
      tcCache = {};
      fortniteCache = {};
      syncUiFromState();
      renderAll();
      persistState();
      showToast('Tournament cleared.');
    }, 'Click again to clear everything');
  });

  // ---------- init ----------
  var restored = loadPersistedState();
  if(restored){
    try{
      state = restored;
      normalizeState();
      syncUiFromState();
    }catch(e){
      console.error('Saved tournament could not be restored cleanly, starting fresh:', e);
      state = { name:"Untitled Tournament", matchTimeLimit:"", profiles:[], game:"general", format:"elim", teams:[], rounds:[], rrMatches:[], brGames:[], brElimPoints:1, watchUsers:[], trackTC:{base:600,increment:0,sinceTs:null}, fortniteApiKey:"", fortniteUsers:[], fortniteSessions:{build:{label:"Build",baselineHistory:[],timeWindow:{startTs:null,endTs:null}},nobuild:{label:"No Build",baselineHistory:[],timeWindow:{startTs:null,endTs:null}}}, fortniteActiveSession:"build", fortnitePoints:{perKill:1,perWin:5}, fortniteModeFilter:"all", fortniteOverrides:{}, view:"main", started:false };
      restored = null;
      syncUiFromState();
      persistState();
    }
  }
  function safeInitRender(){
    renderTeamList();
    renderChessUserList();
    renderFnUserList();
    renderHeader();
    setGame(state.game);
    setupAutoRefresh();
    setupFnAutoRefresh();
    if(restored){
      if(state.watchUsers.length) fetchAllTC(true);
      if(state.fortniteUsers.length) refreshFortniteStats(true);
    }
  }

  try{
    safeInitRender();
  }catch(e){
    console.error('Startup failed, resetting to a clean tournament:', e);
    state = { name:"Untitled Tournament", matchTimeLimit:"", profiles:[], game:"general", format:"elim", teams:[], rounds:[], rrMatches:[], brGames:[], brElimPoints:1, watchUsers:[], trackTC:{base:600,increment:0,sinceTs:null}, fortniteApiKey:"", fortniteUsers:[], fortniteSessions:{build:{label:"Build",baselineHistory:[],timeWindow:{startTs:null,endTs:null}},nobuild:{label:"No Build",baselineHistory:[],timeWindow:{startTs:null,endTs:null}}}, fortniteActiveSession:"build", fortnitePoints:{perKill:1,perWin:5}, fortniteModeFilter:"all", fortniteOverrides:{}, view:"main", started:false };
    restored = null;
    syncUiFromState();
    persistState();
    safeInitRender();
  }
  el.autosaveNote.textContent = storageAvailable
    ? 'Autosaving to this browser — a page refresh will restore your tournament.'
    : "Autosave isn't available here (likely this preview's sandbox) — use Export before refreshing or closing this page.";

  if(location.hash === '#present' || location.hash === '#present-live'){
    if(location.hash === '#present-live'){
      forcedPresentView = 'live';
      switchView('live');
    }
    document.body.classList.add('present', 'locked-view');
  }
})();
