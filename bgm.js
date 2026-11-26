(function () {
  var KEY = "resume-bgm-off";
  var POS_KEY = "resume-bgm-t";
  var TARGET = 0.35;
  var FADE_OUT_MS = 700;
  var FADE_IN_MS = 1400;
  var RESUME_DELAY_MS = 2000;

  var style = document.createElement("style");
  style.textContent =
    ".bgm-btn{position:fixed;right:18px;bottom:18px;z-index:40;padding:8px 14px;" +
    "border:1px solid var(--line,#d9d0c3);border-radius:999px;background:var(--card,#fffdf8);" +
    "color:var(--ink,#1c1915);font:650 14px/1.4 Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;" +
    "cursor:pointer}" +
    ".bgm-btn:hover{border-color:var(--copper,#b4532a);color:var(--copper,#b4532a)}" +
    ".bgm-btn:focus-visible{outline:2px solid var(--copper,#b4532a);outline-offset:2px}";
  document.head.appendChild(style);

  function dirUrl() {
    var path = location.pathname || "/";
    if (/\.html?$/i.test(path)) path = path.replace(/[^/]+$/, "");
    else if (path.slice(-1) !== "/") path += "/";
    return location.origin + path;
  }

  var BASE = dirUrl();
  var pendingPos = (function () {
    var t = parseFloat(sessionStorage.getItem(POS_KEY) || "0");
    return t > 0.25 && isFinite(t) ? t : 0;
  })();
  var posReady = !pendingPos;

  var audio = document.createElement("audio");
  audio.src = BASE + "media/bgm.mp3";
  audio.loop = true;
  audio.preload = "auto";
  audio.autoplay = true;
  audio.volume = TARGET;
  audio.setAttribute("playsinline", "");
  audio.setAttribute("autoplay", "");

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bgm-btn";

  var userStopped = sessionStorage.getItem(KEY) === "1";
  var ducked = false;
  var fadeToken = 0;
  var resumeTimer = 0;
  var waitingGesture = false;
  var navigating = false;

  function label() {
    var off = userStopped || (audio.paused && !ducked);
    btn.textContent = off ? "播放" : "停止播放";
    btn.setAttribute("aria-pressed", off ? "false" : "true");
  }

  function videoPlaying() {
    return Array.prototype.some.call(document.querySelectorAll("video"), function (v) {
      return !v.paused && !v.ended;
    });
  }

  function savePos() {
    if (userStopped || !posReady) return;
    var t = audio.currentTime || 0;
    if (t < 0.2) return;
    pendingPos = t;
    try {
      sessionStorage.setItem(POS_KEY, String(t));
    } catch (err) {}
  }

  function restorePos() {
    if (!pendingPos) {
      posReady = true;
      return;
    }
    if (audio.readyState < 1) return false;
    try {
      audio.currentTime = pendingPos;
      posReady = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  function whenMeta(fn) {
    if (audio.readyState >= 1) {
      fn();
      return;
    }
    audio.addEventListener("loadedmetadata", function once() {
      audio.removeEventListener("loadedmetadata", once);
      fn();
    });
  }

  function cancelFade() {
    fadeToken += 1;
  }

  function cancelResume() {
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = 0;
    }
  }

  function fadeTo(vol, ms, done) {
    cancelFade();
    var token = fadeToken;
    var from = audio.volume;
    if (ms <= 16) {
      audio.volume = vol;
      if (done) done();
      return;
    }
    var start = performance.now();
    function step(now) {
      if (token !== fadeToken) return;
      var t = Math.min(1, (now - start) / ms);
      audio.volume = from + (vol - from) * t;
      if (t < 1) requestAnimationFrame(step);
      else {
        audio.volume = vol;
        if (done) done();
      }
    }
    requestAnimationFrame(step);
  }

  function playThen(fn, onFail) {
    var p = audio.play();
    if (p && p.then) {
      p.then(fn).catch(function () {
        if (onFail) onFail();
        else label();
      });
      return;
    }
    fn();
  }

  function internalFile(url) {
    var u;
    try {
      u = new URL(url, BASE);
    } catch (err) {
      return null;
    }
    if (u.origin !== location.origin) return null;
    var parts = u.pathname.split("/").filter(Boolean);
    var file = parts[parts.length - 1] || "index.html";
    if (file === "cherry" || file === "cherry.html") return "cherry.html";
    if (file === "pet" || file === "pet.html") return "pet.html";
    if (file === "index.html" || file === "index") return "index.html";
    if (!/\./.test(file)) return "index.html";
    return null;
  }

  function pageHref(file) {
    return BASE + file;
  }

  function onFirstGesture(e) {
    if (userStopped || !audio.paused) return;
    if (e.target && e.target.closest && e.target.closest(".bgm-btn")) return;
    if (e.target && e.target.closest) {
      var a = e.target.closest("a");
      if (a && internalFile(a.href)) return;
    }
    disarmGesture();
    playUser({ fade: !pendingPos });
  }

  function armGesture() {
    if (waitingGesture || userStopped) return;
    waitingGesture = true;
    document.addEventListener("pointerdown", onFirstGesture, true);
    document.addEventListener("keydown", onFirstGesture, true);
  }

  function disarmGesture() {
    if (!waitingGesture) return;
    waitingGesture = false;
    document.removeEventListener("pointerdown", onFirstGesture, true);
    document.removeEventListener("keydown", onFirstGesture, true);
  }

  function duckForVideo() {
    if (userStopped || navigating) return;
    cancelResume();
    if (ducked && audio.volume <= 0.02) {
      label();
      return;
    }
    ducked = true;
    label();
    fadeTo(0, FADE_OUT_MS, function () {
      if (!ducked || userStopped) return;
      audio.pause();
      label();
    });
  }

  function unduck() {
    resumeTimer = 0;
    if (userStopped || videoPlaying()) return;
    ducked = false;
    audio.volume = 0;
    playThen(function () {
      if (userStopped || videoPlaying() || ducked) return;
      fadeTo(TARGET, FADE_IN_MS, label);
      label();
    }, armGesture);
    label();
  }

  function scheduleUnduck() {
    if (userStopped || navigating || videoPlaying()) return;
    cancelResume();
    resumeTimer = setTimeout(unduck, RESUME_DELAY_MS);
  }

  function keepDuckedThroughStall() {
    if (userStopped) return;
    cancelResume();
  }

  function playUser(opts) {
    var fade = !opts || opts.fade !== false;
    userStopped = false;
    ducked = false;
    sessionStorage.removeItem(KEY);
    cancelResume();
    disarmGesture();
    if (fade) audio.volume = 0;
    else audio.volume = TARGET;
    whenMeta(function () {
      restorePos();
      playThen(function () {
        if (userStopped) return;
        if (fade) fadeTo(TARGET, FADE_IN_MS, label);
        label();
      }, armGesture);
    });
    label();
  }

  function stopUser() {
    userStopped = true;
    ducked = false;
    pendingPos = 0;
    posReady = true;
    sessionStorage.setItem(KEY, "1");
    sessionStorage.removeItem(POS_KEY);
    cancelResume();
    disarmGesture();
    fadeTo(0, 280, function () {
      if (!userStopped) return;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = TARGET;
      label();
    });
    label();
  }

  function leaveVideoDuck() {
    cancelResume();
    if (userStopped) return;
    if (ducked || audio.paused) {
      ducked = false;
      if (audio.paused) {
        audio.volume = TARGET;
        playThen(label, armGesture);
      } else {
        fadeTo(TARGET, 400, label);
      }
      label();
    }
  }

  function applyPage(doc, href, push) {
    var nextStyle = doc.querySelector("head style");
    var curStyle = document.querySelector("head style");
    if (nextStyle) {
      var imported = document.importNode(nextStyle, true);
      if (curStyle) curStyle.replaceWith(imported);
      else document.head.insertBefore(imported, style);
    }
    var nextMain = doc.querySelector("main");
    var curMain = document.querySelector("main");
    if (!nextMain || !curMain) return false;
    curMain.replaceWith(document.importNode(nextMain, true));
    document.title = doc.title || document.title;
    if (push) history.pushState({ resumeNav: 1 }, "", href);
    window.scrollTo(0, 0);
    leaveVideoDuck();
    return true;
  }

  function go(href, push) {
    savePos();
    var url = new URL(href, BASE).href;
    if (push && url === location.href) return;
    navigating = true;
    fetch(url, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("nav");
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        if (!applyPage(doc, url, push)) throw new Error("nav");
      })
      .catch(function () {
        savePos();
        location.href = url;
      })
      .then(function () {
        setTimeout(function () {
          navigating = false;
        }, 50);
      });
  }

  btn.addEventListener("click", function () {
    if (userStopped || (audio.paused && !ducked)) playUser({ fade: true });
    else stopUser();
  });

  audio.addEventListener("play", function () {
    disarmGesture();
    label();
  });
  audio.addEventListener("pause", function () {
    savePos();
    label();
  });
  audio.addEventListener("timeupdate", savePos);
  audio.addEventListener("loadedmetadata", restorePos);
  window.addEventListener("pagehide", savePos);

  document.addEventListener(
    "play",
    function (e) {
      if (e.target && e.target.tagName === "VIDEO") duckForVideo();
    },
    true
  );
  document.addEventListener(
    "waiting",
    function (e) {
      if (e.target && e.target.tagName === "VIDEO") keepDuckedThroughStall();
    },
    true
  );
  document.addEventListener(
    "stalled",
    function (e) {
      if (e.target && e.target.tagName === "VIDEO") keepDuckedThroughStall();
    },
    true
  );
  document.addEventListener(
    "seeking",
    function (e) {
      if (e.target && e.target.tagName === "VIDEO") keepDuckedThroughStall();
    },
    true
  );
  document.addEventListener(
    "playing",
    function (e) {
      if (e.target && e.target.tagName === "VIDEO" && !e.target.paused && !e.target.ended) {
        keepDuckedThroughStall();
      }
    },
    true
  );
  document.addEventListener(
    "pause",
    function (e) {
      if (!e.target || e.target.tagName !== "VIDEO") return;
      if (navigating) return;
      if (e.target.seeking || !e.target.paused) return;
      scheduleUnduck();
    },
    true
  );
  document.addEventListener(
    "ended",
    function (e) {
      if (e.target && e.target.tagName === "VIDEO") scheduleUnduck();
    },
    true
  );

  document.addEventListener(
    "click",
    function (e) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest ? e.target.closest("a") : null;
      if (!a || !a.getAttribute("href")) return;
      if (a.target && a.target !== "_self") return;
      var file = internalFile(a.getAttribute("href"));
      if (!file) return;
      var dest = pageHref(file);
      if (dest === location.href || dest === location.origin + location.pathname) {
        var here = internalFile(location.href);
        if (here === file) return;
      }
      e.preventDefault();
      e.stopPropagation();
      go(dest, true);
    },
    true
  );

  window.addEventListener("popstate", function () {
    var file = internalFile(location.href) || "index.html";
    go(pageHref(file), false);
  });

  document.body.appendChild(audio);
  document.body.appendChild(btn);
  history.replaceState({ resumeNav: 1 }, "", location.href);
  label();
  if (userStopped) {
    audio.pause();
    label();
  } else {
    playUser({ fade: !pendingPos });
  }
})();
