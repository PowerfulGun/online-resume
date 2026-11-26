(function () {
  var TARGET = 1;
  var FADE_OUT_MS = 700;
  var FADE_IN_MS = 1400;
  var RESUME_DELAY_MS = 2000;

  function dirUrl() {
    var path = location.pathname || "/";
    if (/\.html?$/i.test(path)) path = path.replace(/[^/]+$/, "");
    else if (path.slice(-1) !== "/") path += "/";
    return location.origin + path;
  }

  var BASE = dirUrl();
  var audio = document.createElement("audio");
  audio.src = BASE + "media/intro.mp3";
  audio.preload = "metadata";
  audio.volume = TARGET;
  audio.setAttribute("playsinline", "");

  var ducked = false;
  var fadeToken = 0;
  var resumeTimer = 0;
  var navigating = false;
  var userStopped = true;

  function playing() {
    return !audio.paused && !audio.ended;
  }

  function syncButtons() {
    var on = playing() && !ducked;
    var text = on || (ducked && !userStopped) ? "停止" : "播放自述";
    document.querySelectorAll(".intro-play").forEach(function (btn) {
      btn.textContent = text;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function videoPlaying() {
    return Array.prototype.some.call(document.querySelectorAll("video"), function (v) {
      return !v.paused && !v.ended;
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

  function playThen(fn) {
    var p = audio.play();
    if (p && p.then) p.then(fn).catch(syncButtons);
    else fn();
  }

  function duckForVideo() {
    if (userStopped || navigating) return;
    cancelResume();
    if (ducked && audio.volume <= 0.02) {
      syncButtons();
      return;
    }
    ducked = true;
    fadeTo(0, FADE_OUT_MS, function () {
      if (!ducked || userStopped) return;
      audio.pause();
      syncButtons();
    });
    syncButtons();
  }

  function unduck() {
    resumeTimer = 0;
    if (userStopped || videoPlaying()) return;
    ducked = false;
    audio.volume = 0;
    playThen(function () {
      if (userStopped || videoPlaying() || ducked) return;
      fadeTo(TARGET, FADE_IN_MS, syncButtons);
      syncButtons();
    });
    syncButtons();
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

  function playIntro() {
    userStopped = false;
    ducked = false;
    cancelResume();
    audio.volume = TARGET;
    playThen(syncButtons);
    syncButtons();
  }

  function stopIntro() {
    userStopped = true;
    ducked = false;
    cancelResume();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = TARGET;
    syncButtons();
  }

  function toggleIntro() {
    if (userStopped || (audio.paused && !ducked) || audio.ended) playIntro();
    else stopIntro();
  }

  function leaveVideoDuck() {
    cancelResume();
    if (userStopped) return;
    if (ducked || audio.paused) {
      ducked = false;
      if (audio.paused && !audio.ended) {
        audio.volume = TARGET;
        playThen(syncButtons);
      } else {
        fadeTo(TARGET, 400, syncButtons);
      }
    }
    syncButtons();
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
    if (file === "facts" || file === "facts.html") return "facts.html";
    if (file === "index.html" || file === "index") return "index.html";
    if (!/\./.test(file)) return "index.html";
    return null;
  }

  function pageHref(file) {
    return BASE + file;
  }

  function applyPage(doc, href, push) {
    var nextStyle = doc.querySelector("head style");
    var curStyle = document.querySelector("head style");
    if (nextStyle) {
      var imported = document.importNode(nextStyle, true);
      if (curStyle) curStyle.replaceWith(imported);
      else document.head.appendChild(imported);
    }
    var nextMain = doc.querySelector("main");
    var curMain = document.querySelector("main");
    if (!nextMain || !curMain) return false;
    curMain.replaceWith(document.importNode(nextMain, true));
    document.title = doc.title || document.title;
    if (push) history.pushState({ resumeNav: 1 }, "", href);
    var hash = "";
    try {
      hash = new URL(href, BASE).hash;
    } catch (err) {}
    if (hash) {
      var el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) el.scrollIntoView();
      else window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0);
    }
    leaveVideoDuck();
    syncButtons();
    return true;
  }

  function go(href, push) {
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
        location.href = url;
      })
      .then(function () {
        setTimeout(function () {
          navigating = false;
        }, 50);
      });
  }

  audio.addEventListener("play", syncButtons);
  audio.addEventListener("pause", syncButtons);
  audio.addEventListener("ended", function () {
    userStopped = true;
    ducked = false;
    audio.currentTime = 0;
    syncButtons();
  });

  document.addEventListener("click", function (e) {
    var playBtn = e.target.closest ? e.target.closest(".intro-play") : null;
    if (playBtn) {
      e.preventDefault();
      toggleIntro();
      return;
    }
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest("a") : null;
    if (!a || !a.getAttribute("href")) return;
    if (a.target && a.target !== "_self") return;
    var file = internalFile(a.getAttribute("href"));
    if (!file) return;
    var dest = pageHref(file);
    try {
      var raw = new URL(a.getAttribute("href"), BASE);
      if (raw.hash) dest += raw.hash;
    } catch (err) {}
    var here = internalFile(location.href);
    if (here === file) return;
    e.preventDefault();
    e.stopPropagation();
    go(dest, true);
  });

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

  window.addEventListener("popstate", function () {
    var file = internalFile(location.href) || "index.html";
    go(pageHref(file), false);
  });

  document.body.appendChild(audio);
  history.replaceState({ resumeNav: 1 }, "", location.href);
  syncButtons();
})();
