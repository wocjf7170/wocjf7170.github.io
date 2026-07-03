/* ==========================================================================
   LEAN — 외줄타기 밸런스 게임 (HTML5 Canvas, Vanilla JS)
   조작: ← → 균형 / ↑ 가속 / ↓ 감속 / SPACE 재시작
   ========================================================================== */
(function () {
	"use strict";

	var W = 800, H = 450;
	var CX = 360;            // 플레이어 화면 x
	var ANCHOR_Y = 246;      // 기둥에서의 줄 높이
	var POST_GAP = 560;      // 기둥 간격(px)
	var SAG = 26;            // 줄 처짐(중앙)
	var PX = 3;              // 픽셀아트 블록 크기
	var BEST_KEY = "lean-best-time";
	var NAME_KEY = "lean-player-name";
	var PID_KEY = "lean-player-id";

	var SB_URL = "https://qjuwhmlfyzuwgtxltodp.supabase.co";
	var SB_KEY = "sb_publishable_xE4GDt41odV_sh3ZhvPOew_8P1umWhf";

	function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
	function lerp(a, b, k) { return a + (b - a) * k; }
	function hexRgb(h) {
		return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
	}
	function mixHex(h1, h2, k) {
		var a = hexRgb(h1), b = hexRgb(h2);
		return "rgb(" + Math.round(lerp(a[0], b[0], k)) + "," + Math.round(lerp(a[1], b[1], k)) + "," + Math.round(lerp(a[2], b[2], k)) + ")";
	}
	function fmtTime(t) {
		if (t >= 60) {
			var m = Math.floor(t / 60);
			var s = (t - m * 60).toFixed(2);
			if (t - m * 60 < 10) s = "0" + s;
			return m + ":" + s;
		}
		return t.toFixed(2);
	}

	// 누적 이동 거리(px) — 속도 곡선 v(t) = 120*(1+t/30) 의 적분
	function distAt(t) { return 120 * t + 2 * t * t; }

	/* ---------- Supabase (REST RPC — 테이블 직접 접근 없이 함수만 호출) ---------- */
	function sbRpc(fn, args) {
		return fetch(SB_URL + "/rest/v1/rpc/" + fn, {
			method: "POST",
			headers: {
				"apikey": SB_KEY,
				"Authorization": "Bearer " + SB_KEY,
				"Content-Type": "application/json"
			},
			body: JSON.stringify(args || {})
		}).then(function (r) {
			if (!r.ok) throw new Error("rpc " + fn + ": " + r.status);
			return r.json();
		});
	}
	// 간판 기본 문구 (Supabase lean_billboards 로드 실패 시 사용)
	var BB_DEFAULT = [
		["심재철 · 전산 운영개발", "임직원 600+ IT 운영 2년차"],
		["BOM 쿼리 성능 97% 개선", "MSSQL 실행계획 재설계"],
		["실적 조회 성능 85% 개선", "커버링 인덱스 최적화"],
		["PC 700대 Win11 전환", "업무 중단 없이 완수"],
		["야놀자 백엔드 과정 2/65", "Java · Spring Boot 우수 수료"],
		["SQLD · TOPCIT Lv.3", "C# · ASP.NET · MSSQL"],
		["채용 · 광고 문의", "wocjf7170@gmail.com"]
	];

	// 결정적 의사난수 (건물 배치가 매 프레임 동일해야 한다)
	function hash01(n) {
		var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
		return x - Math.floor(x);
	}

	function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
	function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
	function playerId() {
		var id = storeGet(PID_KEY);
		if (!id) {
			if (window.crypto && crypto.randomUUID) id = crypto.randomUUID();
			else id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
				var r = Math.random() * 16 | 0;
				return (c === "x" ? r : (r & 3 | 8)).toString(16);
			});
			storeSet(PID_KEY, id);
		}
		return id;
	}

	/* ---------- 시간대별 팔레트 (평온 → 폭풍) ---------- */
	var STOPS = [
		{ t: 0,   sky: "#cfd6c1", cloud: "#f3eeda", far: "#b8c3b1", bld: "#a7b5a3", near: "#96a795", rope: "#6e5136", post: "#4c443c", ink: "#2a2a24" },
		{ t: 45,  sky: "#c3cdbf", cloud: "#ece8d4", far: "#adbaad", bld: "#9cab9e", near: "#8b9d8f", rope: "#684d34", post: "#48413a", ink: "#282822" },
		{ t: 90,  sky: "#a8b7b0", cloud: "#d8d8c8", far: "#93a49c", bld: "#83958c", near: "#73877d", rope: "#5d452f", post: "#413b35", ink: "#232320" },
		{ t: 150, sky: "#7f8f8c", cloud: "#a9aea3", far: "#6d7f7a", bld: "#606f70", near: "#535f66", rope: "#4c392a", post: "#36312d", ink: "#1d1d1b" },
		{ t: 240, sky: "#5d6b6e", cloud: "#848a84", far: "#4e5c5c", bld: "#445054", near: "#3a444c", rope: "#3f3024", post: "#2c2825", ink: "#171716" }
	];
	function palette(t) {
		var i = 0;
		while (i < STOPS.length - 2 && t > STOPS[i + 1].t) i++;
		var a = STOPS[i], b = STOPS[i + 1];
		var k = clamp((t - a.t) / (b.t - a.t), 0, 1);
		var out = {};
		for (var key in a) if (key !== "t") out[key] = mixHex(a[key], b[key], k);
		return out;
	}

	/* ---------- 난이도 곡선 ---------- */
	function difficulty(t) {
		function ramp(a, b) { return clamp((t - a) / (b - a), 0, 1); }
		return {
			// 30초에 2배, 1분에 3배... 상한 없이 계속 빨라진다
			speed: 1 + t / 30,
			// 중력(기울어지는 힘)도 상한 없이 계속 증가
			gravity: 1.1 + t / 55,
			noise: 0.25 + 0.7 * ramp(8, 100) + 0.5 * ramp(100, 240),
			wind: 0.55 * ramp(20, 55) + 0.6 * ramp(55, 110) + 0.6 * ramp(110, 200),
			sway: 8 * ramp(25, 55) + 9 * ramp(55, 110) + 8 * ramp(110, 200),
			shake: 2.4 * ramp(55, 110) + 2.8 * ramp(110, 200),
			rain: ramp(105, 140),
			obstacles: t > 100
		};
	}

	/* ---------- 픽셀 라인 (로컬 좌표 기준) ---------- */
	function pixLine(ctx, x0, y0, x1, y1, size, color) {
		var dx = x1 - x0, dy = y1 - y0;
		var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / size));
		ctx.fillStyle = color;
		for (var i = 0; i <= steps; i++) {
			var x = x0 + (dx * i) / steps, y = y0 + (dy * i) / steps;
			ctx.fillRect(Math.round(x / size) * size - size / 2, Math.round(y / size) * size - size / 2, size, size);
		}
	}

	/* ---------- 효과음 (WebAudio, 최소한만) ---------- */
	function Sfx() { this.ctx = null; }
	Sfx.prototype.ensure = function () {
		if (!this.ctx) {
			var AC = window.AudioContext || window.webkitAudioContext;
			if (AC) this.ctx = new AC();
		}
		if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
	};
	Sfx.prototype.beep = function (freq, dur, type, gain, slideTo, at) {
		if (!this.ctx) return;
		try {
			var t0 = this.ctx.currentTime + (at || 0);
			var o = this.ctx.createOscillator();
			var g = this.ctx.createGain();
			o.type = type || "square";
			o.frequency.setValueAtTime(freq, t0);
			if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
			g.gain.setValueAtTime(gain || 0.03, t0);
			g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
			o.connect(g); g.connect(this.ctx.destination);
			o.start(t0); o.stop(t0 + dur + 0.02);
		} catch (e) { /* ignore */ }
	};
	Sfx.prototype.tick = function () { this.beep(620, 0.045, "square", 0.02); };
	Sfx.prototype.warn = function () { this.beep(920, 0.09, "square", 0.04); };
	Sfx.prototype.whack = function () { this.beep(190, 0.12, "square", 0.05, 120); };
	Sfx.prototype.fall = function () { this.beep(420, 0.5, "sawtooth", 0.05, 90); };
	Sfx.prototype.ding = function () { this.beep(990, 0.06, "square", 0.03); this.beep(1480, 0.09, "square", 0.025, 0, 0.07); };
	Sfx.prototype.jingle = function () { this.beep(660, 0.09, "square", 0.04); this.beep(880, 0.09, "square", 0.04, 0, 0.09); this.beep(1320, 0.16, "square", 0.04, 0, 0.18); };
	Sfx.prototype.pickup = function () { this.beep(760, 0.06, "square", 0.035); this.beep(1140, 0.09, "square", 0.03, 0, 0.06); };

	/* ---------- 입력 ---------- */
	function Input(game) {
		this.game = game;
		this.left = false; this.right = false;
		var self = this;

		document.addEventListener("keydown", function (e) {
			if (!game.isOpen()) return;
			if (game.formOpen) {
				if (e.key === "Escape" && game.closeNameForm) game.closeNameForm();
				return;
			}
			var k = e.key;
			if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown" || k === " ") e.preventDefault();
			if (k === "Escape") { game.closeModal(); return; }

			if (game.state === "ready" && (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown" || k === " ")) {
				game.start();
			} else if (game.state === "over" && k === " ") {
				game.start();
			}

			if (k === "ArrowLeft") {
				self.left = true;
				if (!e.repeat && game.state === "playing") { game.player.kick(-1); game.sfx.tick(); }
			} else if (k === "ArrowRight") {
				self.right = true;
				if (!e.repeat && game.state === "playing") { game.player.kick(1); game.sfx.tick(); }
			}

			game.sfx.ensure();
		});

		document.addEventListener("keyup", function (e) {
			if (e.key === "ArrowLeft") self.left = false;
			else if (e.key === "ArrowRight") self.right = false;
		});
	}
	Input.prototype.reset = function () {
		this.left = this.right = false;
	};

	/* ---------- 바람 ---------- */
	function Wind(game) { this.game = game; this.reset(); }
	Wind.prototype.reset = function () {
		var rnd = this.game.rnd.wind;
		this.phase = rnd() * 100;
		this.value = 0; this.force = 0;
		this.gustDur = 0; this.gustT = 0; this.gustDir = 1;
		this.nextGust = 8 + rnd() * 6;
	};
	Wind.prototype.update = function (dt, strength, t) {
		var rnd = this.game.rnd.wind;
		var base = Math.sin(t * 0.35 + this.phase) * 0.45 + Math.sin(t * 0.13 + this.phase * 2) * 0.3;
		this.nextGust -= dt;
		if (this.nextGust <= 0 && this.gustDur <= 0) {
			this.gustDur = 1.2 + rnd() * 1.6;
			this.gustT = 0;
			this.gustDir = rnd() < 0.5 ? -1 : 1;
			this.nextGust = 4 + rnd() * 7;
		}
		var g = 0;
		if (this.gustDur > 0) {
			this.gustT += dt;
			var u = this.gustT / this.gustDur;
			if (u >= 1) this.gustDur = 0;
			else g = Math.sin(Math.PI * u) * this.gustDir;
		}
		this.value = clamp(base + g * 0.95, -1, 1);
		this.force = this.value * strength;
	};

	/* ---------- 외줄 ---------- */
	function Rope(game) { this.game = game; this.scroll = 0; this.swayAmp = 0; }
	Rope.prototype.reset = function () { this.scroll = this.game.rnd.rope() * POST_GAP; this.swayAmp = 0; };
	Rope.prototype.update = function (dt, params, speedPx) {
		this.scroll += speedPx * dt;
		this.swayAmp = lerp(this.swayAmp, params.sway, 1 - Math.pow(0.02, dt));
	};
	Rope.prototype.yAt = function (screenX) {
		var wx = screenX + this.scroll;
		var u = ((wx % POST_GAP) + POST_GAP) % POST_GAP / POST_GAP;
		var sag = SAG * 4 * u * (1 - u);
		var sway = this.swayAmp * Math.sin(this.game.runT * 2.1) * Math.sin(Math.PI * u);
		var jitter = this.swayAmp > 14 ? Math.sin(this.game.runT * 13 + u * 20) * 1.5 : 0;
		return ANCHOR_Y + sag + sway + jitter;
	};
	Rope.prototype.swayNorm = function () {
		return (this.swayAmp / 23) * Math.sin(this.game.runT * 2.1);
	};
	Rope.prototype.draw = function (ctx, pal) {
		var i, x;
		// 기둥
		var first = Math.floor(this.scroll / POST_GAP) * POST_GAP;
		for (i = 0; i < 4; i++) {
			var wx = first + i * POST_GAP;
			x = Math.round(wx - this.scroll);
			if (x < -30 || x > W + 30) continue;
			ctx.fillStyle = pal.post;
			ctx.fillRect(x - 8, ANCHOR_Y - 12, 16, H - (ANCHOR_Y - 12));
			ctx.fillRect(x - 10, ANCHOR_Y - 16, 20, 6);
			// 밧줄 매듭
			ctx.fillStyle = pal.rope;
			ctx.fillRect(x - 11, ANCHOR_Y - 4, 22, 5);
			ctx.fillRect(x - 11, ANCHOR_Y + 4, 22, 4);
		}
		// 줄
		for (x = -6; x <= W + 6; x += 6) {
			var y = this.yAt(x);
			ctx.fillStyle = pal.rope;
			ctx.fillRect(x, Math.round(y), 6, 4);
		}
		// 줄 텍스처(이동감)
		ctx.fillStyle = "rgba(0,0,0,0.22)";
		var off = -(Math.round(this.scroll) % 18);
		for (x = off; x <= W; x += 18) {
			if (x < 0) continue;
			ctx.fillRect(x, Math.round(this.yAt(x)) + 1, 5, 2);
		}
	};

	/* ---------- 플레이어 ---------- */
	function Player(game) { this.game = game; this.reset(); }
	Player.prototype.reset = function () {
		var rnd = this.game.rnd.player;
		this.balance = (rnd() < 0.5 ? -1 : 1) * (0.03 + rnd() * 0.05);
		this.vel = 0;
		this.legPhase = 0;
		this.n1 = rnd() * 10; this.n2 = rnd() * 10; this.n3 = rnd() * 10;
		this.impulseTimer = 2 + rnd() * 3;
		this.fallT = 0; this.fallDir = 1;
	};
	Player.prototype.kick = function (dir) { this.vel += dir * 0.22; };
	Player.prototype.update = function (dt, params) {
		var g = this.game;
		var t = g.time;
		// 속도가 빠를수록 더 불안정
		var gravity = params.gravity * (0.7 + 0.3 * g.speed);
		var noise = Math.sin(t * 1.7 + this.n1) * 0.5 + Math.sin(t * 2.9 + this.n2) * 0.3 + Math.sin(t * 0.7 + this.n3) * 0.2;

		var acc = gravity * this.balance;
		// 우산을 들고 있으면 바람 영향 절반, 대신 보정이 살짝 둔해진다
		var umb = g.umbrellaT > 0;
		acc += g.wind.force * (umb ? 0.45 : 1);
		acc += noise * params.noise;
		acc += g.rope.swayNorm() * 0.4;
		var corr = umb ? 3.4 : 3.8;
		if (g.input.left) acc -= corr;
		if (g.input.right) acc += corr;

		// 간헐적 흔들림 (후반일수록 잦고 세게)
		var rnd = g.rnd.player;
		this.impulseTimer -= dt;
		if (this.impulseTimer <= 0) {
			this.vel += (rnd() * 2 - 1) * 0.12 * (0.5 + params.noise);
			this.impulseTimer = Math.max(0.9, 2.8 - params.noise) + rnd() * 2.5;
		}

		this.vel += acc * dt;
		this.vel -= this.vel * 0.55 * dt;
		this.vel = clamp(this.vel, -3, 3);
		this.balance += this.vel * dt;

		this.legPhase += dt * g.speed * 7;
	};
	Player.prototype.draw = function (ctx, pal) {
		var g = this.game;
		var footY = g.rope.yAt(CX);
		var rot = this.balance * 0.55;
		var drop = 0;
		if (g.state === "falling") {
			rot = this.fallDir * (Math.abs(this.balance) * 0.55 + this.fallT * 3.4);
			drop = this.fallT * this.fallT * 620;
		}

		ctx.save();
		ctx.translate(CX, footY + drop);
		ctx.rotate(rot);

		var ink = pal.ink;
		var body = "#f4f0e2";
		var danger = g.state === "playing" && Math.abs(this.balance) > 0.68;
		var walking = g.state === "playing" || g.state === "falling";

		function box(x, y, w, h) {
			ctx.fillStyle = ink;
			ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
			ctx.fillStyle = body;
			ctx.fillRect(x, y, w, h);
		}

		// 다리 (걷기 사이클 — 빨라질수록 보폭도 커진다)
		var stride = 5 + 2.5 * Math.min(g.speed, 3);
		var swing = walking ? Math.sin(this.legPhase) : 0;
		var liftA = Math.max(0, Math.sin(this.legPhase)) * (4 + g.speed);
		var liftB = Math.max(0, -Math.sin(this.legPhase)) * (4 + g.speed);
		pixLine(ctx, -3, -26, -3 + swing * stride, -liftA, PX, ink);
		pixLine(ctx, 3, -26, 3 - swing * stride, -liftB, PX, ink);

		// 몸통
		box(-6, -54, 12, 30);

		// 팔 (위험할 때 허우적)
		var flail = danger ? Math.sin(g.elapsed * 18) * 6 : 0;
		var armY = danger ? -60 : -44;
		pixLine(ctx, -6, -48, -17, armY + flail, PX, ink);
		pixLine(ctx, 6, -48, 17, armY - flail, PX, ink);

		// 머리 + 눈 (진행 방향)
		box(-9, -78, 18, 18);
		ctx.fillStyle = ink;
		ctx.fillRect(0, -72, 3, 5);
		ctx.fillRect(6, -72, 3, 5);

		// 우산 (효과 끝나기 직전엔 깜빡임)
		if (g.umbrellaT > 0 && !(g.umbrellaT < 1.2 && Math.sin(g.elapsed * 20) < 0)) {
			pixLine(ctx, 9, -46, 15, -86, PX, ink);
			ctx.fillStyle = ink;
			ctx.fillRect(8, -99, 14, 4);
			ctx.fillRect(2, -95, 26, 4);
			ctx.fillRect(-3, -91, 36, 5);
			ctx.fillRect(-3, -86, 3, 3);
			ctx.fillRect(30, -86, 3, 3);
		}

		// 위험 표시(!)
		if (danger && Math.sin(g.elapsed * 14) > 0) {
			ctx.fillStyle = "#d94f43";
			ctx.fillRect(-2, -100, 4, 10);
			ctx.fillRect(-2, -87, 4, 4);
		}

		ctx.restore();
	};

	/* ---------- 장애물 · 아이템 ---------- */
	function Obstacles(game) { this.game = game; this.reset(); }
	Obstacles.prototype.reset = function () { this.list = []; this.timer = 6; this.itemTimer = 18; };
	Obstacles.prototype.update = function (dt, params, speedPx) {
		var g = this.game;
		var rnd = g.rnd.obs;
		// 새는 30초부터 좌우 양쪽에서, 나뭇가지는 100초부터
		if (g.state === "playing" && g.time > 30) {
			this.timer -= dt;
			if (this.timer <= 0) {
				if (params.obstacles && rnd() < 0.35) {
					this.list.push({ type: "branch", x: W + 40, y: 0, vx: 0, hit: false });
				} else {
					var dir = rnd() < 0.5 ? -1 : 1;
					this.list.push({
						type: "bird",
						x: dir < 0 ? W + 40 : -40,
						y: ANCHOR_Y - 45 - rnd() * 35,
						vx: dir * (200 + g.speed * 45 + rnd() * 70),
						flap: rnd() * 6, hit: false
					});
				}
				g.sfx.warn();
				this.timer = Math.max(2.4, 6 - g.time / 45) + rnd() * 3;
			}
		}
		// 우산 아이템 (50초부터, 효과 중이거나 이미 줄 위에 있으면 안 나옴)
		if (g.state === "playing" && g.time > 50 && g.umbrellaT <= 0) {
			var hasUmb = false;
			for (var u = 0; u < this.list.length; u++) if (this.list[u].type === "umbrella") hasUmb = true;
			if (!hasUmb) {
				this.itemTimer -= dt;
				if (this.itemTimer <= 0) {
					this.list.push({ type: "umbrella", x: W + 30, y: 0, vx: 0, hit: false });
					this.itemTimer = 30 + rnd() * 20;
				}
			}
		}
		for (var i = this.list.length - 1; i >= 0; i--) {
			var o = this.list[i];
			o.x += (o.type === "bird" ? o.vx : -speedPx) * dt;
			if (o.type === "bird") o.flap += dt * 14;
			if (!o.hit && g.state === "playing") {
				if (o.type === "bird") {
					// 지나가는 순간 진행 방향으로 한 번 치고 간다
					if ((o.vx < 0 && o.x < CX + 12) || (o.vx > 0 && o.x > CX - 12)) {
						o.hit = true;
						g.player.vel += (o.vx > 0 ? 1 : -1) * 0.55 * (g.umbrellaT > 0 ? 0.5 : 1);
						g.sfx.whack();
						g.hitShake = 6;
					}
				} else if (o.type === "umbrella") {
					if (o.x < CX + 10) {
						g.umbrellaT = 5;
						g.sfx.pickup();
						this.list.splice(i, 1);
						continue;
					}
				} else if (o.x < CX + 12) {
					o.hit = true;
					g.player.vel += (rnd() < 0.5 ? -1 : 1) * 0.3;
					g.hitShake = 4;
				}
			}
			if (o.x < -70 || o.x > W + 70) this.list.splice(i, 1);
		}
	};
	Obstacles.prototype.draw = function (ctx, pal) {
		var g = this.game;
		for (var i = 0; i < this.list.length; i++) {
			var o = this.list[i];
			ctx.fillStyle = pal.ink;
			if (o.type === "bird") {
				var w = Math.sin(o.flap) * 7;
				var dir = o.vx > 0 ? 1 : -1;
				pixLine(ctx, o.x, o.y, o.x - 10, o.y - w, PX, pal.ink);
				pixLine(ctx, o.x, o.y, o.x + 10, o.y - w, PX, pal.ink);
				ctx.fillRect(Math.round(o.x) - 3, Math.round(o.y) - 2, 7, 5);
				ctx.fillRect(Math.round(o.x) + dir * 5, Math.round(o.y) - 1, 3, 3);
				// 접근 경고 (아직 멀리 있을 때 화면 가장자리에 ! 표시)
				if (!o.hit && Math.abs(o.x - CX) > 260 && Math.sin(g.elapsed * 16) > 0) {
					ctx.fillStyle = "#d94f43";
					var ex = dir < 0 ? W - 18 : 18;
					ctx.fillRect(ex - 2, o.y - 12, 4, 10);
					ctx.fillRect(ex - 2, o.y + 1, 4, 4);
					ctx.fillStyle = pal.ink;
				}
			} else if (o.type === "umbrella") {
				var uy = g.rope.yAt(o.x);
				pixLine(ctx, o.x, uy - 2, o.x, uy - 22, PX, pal.ink);
				ctx.fillRect(Math.round(o.x) - 5, Math.round(uy) - 32, 10, 3);
				ctx.fillRect(Math.round(o.x) - 9, Math.round(uy) - 29, 18, 3);
				ctx.fillRect(Math.round(o.x) - 12, Math.round(uy) - 26, 24, 4);
			} else {
				var by = g.rope.yAt(o.x);
				pixLine(ctx, o.x, by, o.x, by - 16, PX, pal.ink);
				pixLine(ctx, o.x, by - 10, o.x + 8, by - 20, PX, pal.ink);
				pixLine(ctx, o.x, by - 14, o.x - 7, by - 22, PX, pal.ink);
			}
		}
	};

	/* ---------- UI ---------- */
	function UI(game) { this.game = game; }
	UI.prototype.draw = function (ctx, pal) {
		var g = this.game;
		var mono = "Menlo, Consolas, 'Courier New', monospace";

		// TIME (기록 갱신 중이거나 마일스톤 통과 시 골드)
		var gold = "#b3872b";
		var timeCol = pal.ink;
		if (g.passedBest) timeCol = gold;
		else if (g.milestoneFx > 0 && Math.sin(g.elapsed * 18) > 0) timeCol = gold;
		ctx.textAlign = "left";
		ctx.fillStyle = pal.ink;
		ctx.font = "700 14px " + mono;
		ctx.fillText("TIME", 26, 40);
		ctx.fillStyle = timeCol;
		ctx.font = "700 30px " + mono;
		ctx.fillText(fmtTime(g.time), 26, 72);
		if (g.best > 0) {
			ctx.fillStyle = pal.ink;
			ctx.font = "700 12px " + mono;
			ctx.globalAlpha = 0.55;
			ctx.fillText("BEST " + fmtTime(g.best), 26, 92);
			ctx.globalAlpha = 1;
		}
		// 기록 갱신 순간 알림
		if (g.newBestFx > 0) {
			ctx.fillStyle = gold;
			ctx.font = "700 14px " + mono;
			ctx.globalAlpha = Math.min(1, g.newBestFx);
			ctx.fillText("NEW BEST!", 26, 112);
			ctx.globalAlpha = 1;
		}
		// 다른 플레이어 깃발 통과 알림
		if (g.passFx > 0 && g.state === "playing") {
			ctx.textAlign = "center";
			ctx.fillStyle = gold;
			ctx.font = "700 15px " + mono;
			ctx.globalAlpha = Math.min(1, g.passFx);
			ctx.fillText(g.passName + " 넘었다!", W / 2, 130);
			ctx.globalAlpha = 1;
			ctx.textAlign = "left";
		}

		// 다음 깃발 추격 (남은 시간 = 깃발 주인의 기록 - 현재 시간)
		if (g.state === "playing") {
			var target = null;
			for (var ti = 0; ti < g.flags.length; ti++) {
				var tf = g.flags[ti];
				if (tf.passed || tf.dist <= g.dist) continue;
				if (g.bestDist > 0 && Math.abs(tf.dist - g.bestDist) < 40) continue;
				target = tf;
				break;
			}
			if (target) {
				var remain = Math.max(0, target.score - g.time);
				var closeIn = remain < 3;
				ctx.textAlign = "center";
				ctx.font = "700 13px " + mono;
				ctx.fillStyle = closeIn ? gold : pal.ink;
				ctx.globalAlpha = closeIn ? 0.75 + 0.25 * Math.sin(g.elapsed * 10) : 0.7;
				ctx.fillText("다음 깃발  " + g.flagLabel(target) + " · " + remain.toFixed(1) + "초", W / 2, 40);
				ctx.globalAlpha = 1;
				ctx.textAlign = "left";
			}
		}
		// 우산 게이지
		if (g.umbrellaT > 0) {
			var uy2 = 124;
			ctx.fillStyle = pal.ink;
			ctx.fillRect(29, uy2, 8, 2);
			ctx.fillRect(27, uy2 + 2, 12, 2);
			ctx.fillRect(32, uy2 + 4, 2, 6);
			ctx.fillRect(46, uy2 + 3, Math.round(40 * (g.umbrellaT / 5)), 3);
		}

		// BALANCE 미터
		var mx = W / 2, my = 404, half = 110;
		ctx.font = "700 12px " + mono;
		ctx.textAlign = "center";
		ctx.fillStyle = pal.ink;
		ctx.fillText("BALANCE", mx, my - 14);
		ctx.fillRect(mx - half, my, half * 2, 2);
		for (var i = -4; i <= 4; i++) {
			var th = i === 0 ? 10 : 6;
			ctx.fillRect(mx + (i * half) / 4 - 1, my - th / 2 + 1, 2, th);
		}
		ctx.font = "700 14px " + mono;
		ctx.fillText("-", mx - half - 16, my + 6);
		ctx.fillText("+", mx + half + 16, my + 6);
		// 마커
		var b = clamp(g.player.balance, -1, 1);
		ctx.fillStyle = Math.abs(b) > 0.6 ? "#d94f43" : pal.ink;
		ctx.fillRect(mx + b * half - 2, my - 8, 5, 18);

		// 강풍 방향 표시
		if (Math.abs(g.wind.force) > 0.3 && g.state === "playing") {
			ctx.fillStyle = "rgba(217,79,67,0.85)";
			ctx.font = "700 16px " + mono;
			ctx.fillText(g.wind.force > 0 ? "»" : "«", mx + (g.wind.force > 0 ? half + 44 : -half - 44), my + 7);
		}

		// 위험 비네트
		var ab = Math.abs(g.player.balance);
		if (g.state === "playing" && ab > 0.68) {
			var a = clamp((ab - 0.68) / 0.32, 0, 1) * (0.28 + Math.sin(g.elapsed * 10) * 0.08);
			var grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
			grad.addColorStop(0, "rgba(217,79,67,0)");
			grad.addColorStop(1, "rgba(217,79,67," + a.toFixed(3) + ")");
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, W, H);
		}

		// 넘어질 때 화면 붉게
		if (g.state === "falling" || g.state === "over") {
			var fa = g.state === "over" ? 0.30 : clamp(g.player.fallT / 0.85, 0, 1) * 0.30;
			ctx.fillStyle = "rgba(190,110,100," + fa.toFixed(3) + ")";
			ctx.fillRect(0, 0, W, H);
		}

		var blink = Math.sin(g.elapsed * 4) > -0.2;

		// 시작 안내 (캐릭터와 겹치지 않게 위/아래로 배치)
		if (g.state === "ready") {
			ctx.textAlign = "center";
			ctx.fillStyle = pal.ink;
			ctx.font = "700 40px " + mono;
			ctx.fillText("LEAN", W / 2, 104);
			ctx.font = "700 17px " + mono;
			ctx.fillText("← →  균형을 잡아 버텨보세요", W / 2, 138);
			ctx.font = "700 13px " + mono;
			ctx.globalAlpha = 0.65;
			ctx.fillText("시간이 지날수록 점점 빨라집니다", W / 2, 160);
			ctx.globalAlpha = 1;
			if (g.flags.length) {
				ctx.font = "700 11px " + mono;
				ctx.globalAlpha = 0.55;
				ctx.fillText("금색 깃발: 역대 기록 · 파란 깃발: 이번 주 신기록", W / 2, 180);
				ctx.globalAlpha = 1;
			}
			if (blink) {
				ctx.font = "700 15px " + mono;
				ctx.fillText(g.touchMode ? "화면을 터치해 시작" : "아무 키나 눌러 시작", W / 2, 332);
			}
		}

		// 게임 오버 (온라인 순위가 로드되면 패널이 늘어나 TOP 5까지 보여준다)
		if (g.state === "over") {
			var rk = g.rank;
			var hasRank = !!(rk && rk.total > 0);
			var topList = hasRank && rk.top ? rk.top : [];
			var pw = 420;
			var ph = 190 + (hasRank ? 24 : 0) + (topList.length ? 16 + topList.length * 18 : 0);
			var px0 = (W - pw) / 2, py0 = (H - ph) / 2 - 8;
			ctx.fillStyle = "rgba(18,18,16,0.9)";
			ctx.fillRect(px0, py0, pw, ph);
			ctx.strokeStyle = "rgba(244,240,226,0.25)";
			ctx.lineWidth = 2;
			ctx.strokeRect(px0 + 5, py0 + 5, pw - 10, ph - 10);

			ctx.textAlign = "center";
			ctx.fillStyle = "#d94f43";
			ctx.font = "700 34px " + mono;
			ctx.fillText("GAME OVER", W / 2, py0 + 56);
			ctx.fillStyle = "#f4f0e2";
			ctx.font = "700 24px " + mono;
			ctx.fillText(fmtTime(g.time) + " s", W / 2, py0 + 94);
			var cy = py0 + 120;
			ctx.font = "700 13px " + mono;
			if (g.newBest) {
				ctx.fillStyle = "#e6c878";
				ctx.fillText("NEW BEST!", W / 2, cy);
			} else if (g.best > 0) {
				ctx.fillStyle = "rgba(244,240,226,0.55)";
				ctx.fillText("BEST " + fmtTime(g.best), W / 2, cy);
			}
			cy += 24;
			if (hasRank) {
				var pct = Math.min(100, Math.max(1, Math.round((rk.rank / rk.total) * 100)));
				ctx.fillStyle = "#e6c878";
				ctx.fillText("전체 " + rk.total + "명 중 " + Math.min(rk.rank, rk.total) + "위 · 상위 " + pct + "%", W / 2, cy);
				cy += 24;
			}
			if (topList.length) {
				ctx.fillStyle = "rgba(244,240,226,0.2)";
				ctx.fillRect(px0 + 36, cy - 12, pw - 72, 1);
				cy += 8;
				var myName = storeGet(NAME_KEY);
				ctx.font = "700 12px " + mono;
				for (var li = 0; li < topList.length; li++) {
					var row = topList[li];
					var mine = myName && row.name === myName;
					ctx.fillStyle = mine ? "#e6c878" : "rgba(244,240,226,0.75)";
					ctx.textAlign = "left";
					ctx.fillText((li + 1) + "  " + row.name, px0 + 48, cy);
					ctx.textAlign = "right";
					ctx.fillText(fmtTime(Number(row.score)), px0 + pw - 48, cy);
					cy += 18;
				}
				ctx.textAlign = "center";
			}
			if (blink) {
				ctx.fillStyle = "rgba(244,240,226,0.85)";
				ctx.font = "700 14px " + mono;
				ctx.fillText(g.touchMode ? "화면을 터치해 재시작" : "Press SPACE to Restart", W / 2, py0 + ph - 24);
			}
		}
		ctx.textAlign = "left";
	};

	/* ---------- 게임 ---------- */
	function Game(modal, canvas) {
		this.modal = modal;
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		this.ctx.imageSmoothingEnabled = false;

		// 랜덤 스트림 (서브시스템 생성 전에 준비)
		this.rnd = { wind: Math.random, player: Math.random, obs: Math.random, rope: Math.random };
		this.runT = 0;

		this.sfx = new Sfx();
		this.input = new Input(this);
		this.wind = new Wind(this);
		this.rope = new Rope(this);
		this.player = new Player(this);
		this.obstacles = new Obstacles(this);
		this.ui = new UI(this);

		this.state = "ready";
		this.time = 0;
		this.elapsed = 0;
		this.speed = 1;
		this.hitShake = 0;
		this.warnCd = 0;
		this.newBest = false;
		this.touchMode = "ontouchstart" in window;
		this.raf = null;
		this.lastTs = 0;

		// 기록 깃발 · 마일스톤 · 우산
		this.dist = 0;
		this.bestDist = -1;
		this.passedBest = false;
		this.newBestFx = 0;
		this.milestoneFx = 0;
		this.lastMilestone = 0;
		this.umbrellaT = 0;

		// 온라인 깃발 (다른 플레이어들의 기록)
		this.flags = [];
		this.rank = null;
		this.billboards = BB_DEFAULT;
		this.passFx = 0;
		this.passName = "";
		this.formOpen = false;
		this.nameSkipped = false;
		this.askName = null;       // init()에서 연결
		this.closeNameForm = null; // init()에서 연결

		this.best = 0;
		try { this.best = parseFloat(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { /* ignore */ }

		// 구름
		this.clouds = [];
		for (var i = 0; i < 5; i++) {
			this.clouds.push({
				x: Math.random() * W, y: 30 + Math.random() * 110,
				s: 0.7 + Math.random() * 0.9, v: 4 + Math.random() * 6
			});
		}
		// 비 / 바람 줄기 파티클
		this.rain = [];
		for (i = 0; i < 80; i++) this.rain.push({ x: Math.random() * W, y: Math.random() * H });
		this.streaks = [];
		for (i = 0; i < 12; i++) this.streaks.push({ x: Math.random() * W, y: Math.random() * H * 0.65, l: 10 + Math.random() * 14 });

		this.bindPointer();
	}

	Game.prototype.isOpen = function () {
		return this.modal.classList.contains("is-open");
	};

	Game.prototype.bindPointer = function () {
		var self = this, canvas = this.canvas;
		function pos(e) {
			var r = canvas.getBoundingClientRect();
			var cx = (e.touches && e.touches.length ? e.touches[0].clientX : e.clientX);
			return (cx - r.left) / r.width; // 0~1
		}
		function press(e) {
			e.preventDefault();
			if (self.formOpen) return;
			self.sfx.ensure();
			if (self.state === "ready" || self.state === "over") { self.start(); return; }
			if (self.state !== "playing") return;
			var u = pos(e);
			if (u < 0.5) { self.input.left = true; self.player.kick(-1); }
			else { self.input.right = true; self.player.kick(1); }
			self.sfx.tick();
		}
		function release() { self.input.left = false; self.input.right = false; }
		canvas.addEventListener("touchstart", press, { passive: false });
		canvas.addEventListener("touchend", release);
		canvas.addEventListener("touchcancel", release);
		canvas.addEventListener("mousedown", press);
		window.addEventListener("mouseup", release);
	};

	/* ----- 온라인 깃발: 서버에서 병합된 대표 깃발만 받아온다 ----- */
	Game.prototype.loadFlags = function () {
		var self = this;
		sbRpc("get_lean_flags", { p_best: this.best }).then(function (rows) {
			var flags = [];
			for (var i = 0; i < rows.length; i++) {
				var sc = Number(rows[i].score);
				flags.push({ name: rows[i].name, score: sc, cnt: rows[i].cnt, weekly: !!rows[i].weekly, dist: distAt(sc), passed: false });
			}
			flags.sort(function (a, b) { return a.dist - b.dist; });
			// 화면 밀집 방지: 90px 안쪽으로 붙은 깃발은 높은 점수 쪽으로 병합
			var merged = [];
			for (i = 0; i < flags.length; i++) {
				var f = flags[i];
				var prev = merged[merged.length - 1];
				if (prev && f.dist - prev.dist < 90) {
					f.cnt += prev.cnt;
					merged[merged.length - 1] = f;
				} else merged.push(f);
			}
			self.flags = merged;
		}).catch(function () { /* 오프라인이어도 게임은 계속 */ });
	};

	Game.prototype.flagLabel = function (f) {
		return f.cnt > 1 ? f.name + " 외 " + (f.cnt - 1) + "명" : f.name;
	};

	Game.prototype.loadBillboards = function () {
		var self = this;
		sbRpc("get_lean_billboards", {}).then(function (rows) {
			if (rows && rows.length) {
				self.billboards = rows.map(function (r) { return [r.line1 || "", r.line2 || ""]; });
			}
		}).catch(function () { /* 기본 문구 유지 */ });
	};

	Game.prototype.loadRank = function () {
		var self = this;
		if (this.best < 3) return;
		sbRpc("get_lean_rank", { p_score: Math.round(this.best * 100) / 100 }).then(function (r) {
			self.rank = r;
		}).catch(function () { /* ignore */ });
	};

	Game.prototype.submitScore = function () {
		var self = this;
		if (this.best < 3) return;
		var name = storeGet(NAME_KEY);
		if (!name) {
			this.loadRank();
			if (!this.nameSkipped && this.askName) this.askName();
			return;
		}
		sbRpc("submit_lean_score", {
			p_player_id: playerId(),
			p_name: name,
			p_score: Math.round(this.best * 100) / 100
		}).then(function () { self.loadFlags(); self.loadRank(); })
			.catch(function () { self.loadRank(); });
	};

	Game.prototype.resetRun = function () {
		this.time = 0;
		this.speed = 1;
		this.runT = 0;
		this.newBest = false;
		this.hitShake = 0;
		this.dist = 0;
		this.passedBest = false;
		this.newBestFx = 0;
		this.milestoneFx = 0;
		this.lastMilestone = 0;
		this.umbrellaT = 0;
		this.bestDist = this.best >= 3 ? distAt(this.best) : -1;
		this.passFx = 0;
		this.passName = "";
		for (var i = 0; i < this.flags.length; i++) this.flags[i].passed = false;
		this.player.reset();
		this.wind.reset();
		this.rope.reset();
		this.obstacles.reset();
	};

	Game.prototype.toReady = function () {
		this.state = "ready";
		this.resetRun();
		this.input.reset();
	};

	Game.prototype.start = function () {
		this.resetRun();
		this.state = "playing";
	};

	Game.prototype.gameOver = function () {
		this.state = "over";
		if (this.time > this.best) {
			this.best = this.time;
			this.newBest = true;
			try { localStorage.setItem(BEST_KEY, String(this.best)); } catch (e) { /* ignore */ }
		}
		this.rank = null;
		this.submitScore();
	};

	Game.prototype.update = function (dt) {
		this.elapsed += dt;
		this.runT += dt;
		var params = difficulty(this.time);

		if (this.state === "playing") {
			// 시간이 지날수록 점점 빨리 걷는다
			this.speed = params.speed;
			this.time += dt;

			var speedPx = 120 * this.speed;
			this.dist += speedPx * dt;
			this.umbrellaT = Math.max(0, this.umbrellaT - dt);
			this.wind.update(dt, params.wind, this.runT);
			this.rope.update(dt, params, speedPx);
			this.player.update(dt, params);
			this.obstacles.update(dt, params, speedPx);

			// 30초 마일스톤 반짝임
			var ms = Math.floor(this.time / 30);
			if (ms > this.lastMilestone) {
				this.lastMilestone = ms;
				this.milestoneFx = 1.2;
				this.sfx.ding();
			}

			// 최고 기록 깃발 통과
			if (!this.passedBest && this.bestDist > 0 && this.dist > this.bestDist) {
				this.passedBest = true;
				this.newBestFx = 2.2;
				this.sfx.jingle();
			}

			// 다른 플레이어 깃발 통과 (내 BEST 깃발 자리는 NEW BEST 알림에게 양보)
			for (var fi = 0; fi < this.flags.length; fi++) {
				var fl = this.flags[fi];
				if (!fl.passed && this.dist > fl.dist) {
					fl.passed = true;
					if (this.bestDist > 0 && Math.abs(fl.dist - this.bestDist) < 40) continue;
					this.passFx = 1.6;
					this.passName = this.flagLabel(fl);
					this.sfx.ding();
				}
			}

			// 경고음
			this.warnCd -= dt;
			var ab = Math.abs(this.player.balance);
			if (ab > 0.78 && this.warnCd <= 0) { this.sfx.warn(); this.warnCd = 0.7; }

			if (ab > 1) {
				this.state = "falling";
				this.player.fallT = 0;
				this.player.fallDir = this.player.balance > 0 ? 1 : -1;
				this.sfx.fall();
			}
		} else if (this.state === "falling") {
			this.player.fallT += dt;
			this.rope.update(dt, params, 30);
			if (this.player.fallT > 0.85) this.gameOver();
		} else {
			// ready / over: 잔잔한 배경
			this.wind.update(dt, 0.1, this.runT);
			this.rope.update(dt, { sway: this.state === "ready" ? 2 : 0 }, this.state === "ready" ? 26 : 0);
		}

		this.hitShake = Math.max(0, this.hitShake - dt * 10);
		this.milestoneFx = Math.max(0, this.milestoneFx - dt);
		this.newBestFx = Math.max(0, this.newBestFx - dt);
		this.passFx = Math.max(0, this.passFx - dt);

		// 구름
		for (var i = 0; i < this.clouds.length; i++) {
			var c = this.clouds[i];
			c.x -= (c.v + (this.state === "playing" ? this.speed * 6 : 2) + this.wind.force * 14) * dt;
			if (c.x < -120) { c.x = W + 120; c.y = 30 + Math.random() * 110; }
			if (c.x > W + 140) { c.x = -110; }
		}
		// 비
		if (params.rain > 0 && this.state !== "over") {
			for (i = 0; i < this.rain.length; i++) {
				var r = this.rain[i];
				r.y += 460 * dt;
				r.x += (this.wind.value * 140 - 30) * dt;
				if (r.y > H) { r.y = -10; r.x = Math.random() * (W + 100) - 50; }
			}
		}
		// 바람 줄기
		for (i = 0; i < this.streaks.length; i++) {
			var s = this.streaks[i];
			s.x += this.wind.value * 260 * dt;
			if (s.x > W + 30) { s.x = -30; s.y = Math.random() * H * 0.65; }
			if (s.x < -30) { s.x = W + 30; s.y = Math.random() * H * 0.65; }
		}
	};

	Game.prototype.mountainY = function (screenX, layer) {
		var k = layer === 0 ? 0.16 : 0.34;
		var wx = (screenX + this.rope.scroll * k) * (layer === 0 ? 1 : 1.3);
		var h = Math.sin(wx * 0.008) + Math.sin(wx * 0.0203 + 1.7) * 0.6 + Math.sin(wx * 0.005 + 4) * 0.8;
		var base = layer === 0 ? 322 : 372;
		var amp = layer === 0 ? 42 : 34;
		return Math.round((base + h * amp * 0.45) / 6) * 6;
	};

	/* ----- 배경 건물 + 간판 (원경 산과 근경 산 사이 패럴랙스 레이어) ----- */
	Game.prototype.drawBuildings = function (ctx, pal) {
		var K = 0.25, SLOT = 190;
		var scroll = this.rope.scroll * K;
		var first = Math.floor(scroll / SLOT) - 1;
		var last = first + Math.ceil(W / SLOT) + 2;
		for (var idx = first; idx <= last; idx++) {
			// 세 건물마다 하나는 간판 건물 (키를 맞춰 간판이 항상 줄 아래 배경에 오게)
			var hasBB = ((idx % 3) + 3) % 3 === 1 && this.billboards.length > 0;
			var bw = 84 + Math.round(hash01(idx) * 9) * 6;
			var bh = hasBB
				? 114 + Math.round(hash01(idx * 7 + 3) * 3) * 6
				: 66 + Math.round(hash01(idx * 7 + 3) * 11) * 6;
			var x = Math.round(idx * SLOT - scroll + (SLOT - bw) / 2);
			if (x + bw < -80 || x > W + 80) continue;
			var topY = 402 - bh;
			// 몸체 (아래는 근경 산이 덮는다)
			ctx.fillStyle = pal.bld;
			ctx.fillRect(x, topY, bw, H - topY);
			// 옥상 구조물
			ctx.fillRect(x + 8, topY - 8, 14, 8);
			// 창문
			ctx.fillStyle = "rgba(0,0,0,0.13)";
			for (var wy = topY + 10; wy < 392; wy += 16) {
				for (var wx = x + 8; wx <= x + bw - 16; wx += 18) {
					ctx.fillRect(wx, wy, 8, 8);
				}
			}
			// 간판 (문구는 순서대로 순환)
			if (hasBB) {
				var n = this.billboards.length;
				var msg = this.billboards[((Math.floor(idx / 3) % n) + n) % n];
				this.drawBillboard(ctx, pal, x + bw / 2, topY, msg);
			}
		}
	};

	Game.prototype.drawBillboard = function (ctx, pal, cx, topY, msg) {
		var mono = "Menlo, Consolas, 'Courier New', monospace";
		var bw = 208, bh = 40;
		var x = Math.round(cx - bw / 2), y = Math.round(topY + 12);
		// 지붕에서 내려온 걸이
		ctx.fillStyle = pal.post;
		ctx.fillRect(Math.round(cx) - 42, topY, 4, 14);
		ctx.fillRect(Math.round(cx) + 38, topY, 4, 14);
		// 패널 (구름색이라 시간대에 따라 함께 어두워진다)
		ctx.fillStyle = pal.ink;
		ctx.fillRect(x - 3, y - 3, bw + 6, bh + 6);
		ctx.fillStyle = pal.cloud;
		ctx.fillRect(x, y, bw, bh);
		// 문구 (넘치면 폰트를 줄여서 맞춘다)
		ctx.fillStyle = pal.ink;
		ctx.textAlign = "center";
		var f = 13;
		ctx.font = "700 " + f + "px " + mono;
		while (f > 9 && ctx.measureText(msg[0]).width > bw - 12) {
			f--;
			ctx.font = "700 " + f + "px " + mono;
		}
		ctx.fillText(msg[0], Math.round(cx), y + 17);
		if (msg[1]) {
			f = 10;
			ctx.font = "700 " + f + "px " + mono;
			while (f > 8 && ctx.measureText(msg[1]).width > bw - 12) {
				f--;
				ctx.font = "700 " + f + "px " + mono;
			}
			ctx.globalAlpha = 0.7;
			ctx.fillText(msg[1], Math.round(cx), y + 32);
			ctx.globalAlpha = 1;
		}
		ctx.textAlign = "left";
	};

	Game.prototype.draw = function () {
		var ctx = this.ctx;
		var pal = palette(this.time);
		var params = difficulty(this.time);

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		// 화면 흔들림
		var shake = (this.state === "playing" ? params.shake : 0) + this.hitShake;
		if (shake > 0) {
			ctx.translate(
				Math.sin(this.elapsed * 37) * shake * 0.5,
				Math.cos(this.elapsed * 29) * shake * 0.4
			);
		}

		// 하늘
		ctx.fillStyle = pal.sky;
		ctx.fillRect(-8, -8, W + 16, H + 16);

		// 구름 (픽셀)
		ctx.fillStyle = pal.cloud;
		for (var i = 0; i < this.clouds.length; i++) {
			var c = this.clouds[i];
			var s = c.s;
			ctx.fillRect(Math.round(c.x), Math.round(c.y), 66 * s, 14 * s);
			ctx.fillRect(Math.round(c.x + 12 * s), Math.round(c.y - 9 * s), 34 * s, 10 * s);
			ctx.fillRect(Math.round(c.x + 20 * s), Math.round(c.y + 13 * s), 30 * s, 7 * s);
		}

		// 바람 줄기
		if (Math.abs(this.wind.force) > 0.12) {
			ctx.fillStyle = "rgba(255,255,255,0.35)";
			var n = Math.min(this.streaks.length, Math.round(Math.abs(this.wind.force) * 12));
			for (i = 0; i < n; i++) {
				var st = this.streaks[i];
				ctx.fillRect(Math.round(st.x), Math.round(st.y), st.l, 2);
			}
		}

		// 산 (원경) → 건물 → 산 (근경)
		var x;
		var self = this;
		function mountainLayer(layer) {
			ctx.fillStyle = layer === 0 ? pal.far : pal.near;
			ctx.beginPath();
			ctx.moveTo(-8, H + 8);
			for (x = -8; x <= W + 8; x += 10) ctx.lineTo(x, self.mountainY(x, layer));
			ctx.lineTo(W + 8, H + 8);
			ctx.closePath();
			ctx.fill();
		}
		mountainLayer(0);
		this.drawBuildings(ctx, pal);
		mountainLayer(1);

		// 줄 + 기둥
		this.rope.draw(ctx, pal);

		// 다른 플레이어 깃발 (역대 기록 금색 · 이번 주 신기록 파랑 — 넘으면 옅어진다)
		if (this.state === "playing" || this.state === "falling") {
			ctx.font = "700 10px Menlo, Consolas, 'Courier New', monospace";
			ctx.textAlign = "center";
			for (i = 0; i < this.flags.length; i++) {
				var fl = this.flags[i];
				// 내 BEST 깃발과 겹치는 자리는 BEST에게 양보
				if (this.bestDist > 0 && Math.abs(fl.dist - this.bestDist) < 40) continue;
				var flx = CX + (fl.dist - this.dist);
				if (flx < -90 || flx > W + 90) continue;
				var fly = this.rope.yAt(flx);
				ctx.globalAlpha = fl.passed ? 0.45 : 1;
				ctx.fillStyle = pal.ink;
				ctx.fillRect(Math.round(flx) - 1, Math.round(fly) - 32, 3, 32);
				ctx.fillStyle = fl.weekly ? "#3d6f9e" : "#b3872b";
				ctx.fillRect(Math.round(flx) + 2, Math.round(fly) - 32, 12, 4);
				ctx.fillRect(Math.round(flx) + 2, Math.round(fly) - 28, 9, 4);
				ctx.fillRect(Math.round(flx) + 2, Math.round(fly) - 24, 5, 3);
				ctx.fillStyle = pal.ink;
				ctx.fillText(this.flagLabel(fl), Math.round(flx), Math.round(fly) - 38);
				ctx.globalAlpha = 1;
			}
			ctx.textAlign = "left";
		}

		// 최고 기록 깃발 (지난 기록 지점이 줄 위에 보인다)
		if (this.bestDist > 0 && (this.state === "playing" || this.state === "falling")) {
			var fx = CX + (this.bestDist - this.dist);
			if (fx > -60 && fx < W + 80) {
				var fy = this.rope.yAt(fx);
				ctx.fillStyle = pal.ink;
				ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 38, 3, 38);
				ctx.fillStyle = "#d94f43";
				ctx.fillRect(Math.round(fx) + 2, Math.round(fy) - 38, 14, 5);
				ctx.fillRect(Math.round(fx) + 2, Math.round(fy) - 33, 10, 4);
				ctx.fillRect(Math.round(fx) + 2, Math.round(fy) - 29, 6, 3);
				ctx.fillStyle = pal.ink;
				ctx.font = "700 11px Menlo, Consolas, 'Courier New', monospace";
				ctx.textAlign = "center";
				ctx.fillText("BEST " + fmtTime(this.best), Math.round(fx), Math.round(fy) - 46);
				ctx.textAlign = "left";
			}
		}

		// 장애물
		this.obstacles.draw(ctx, pal);

		// 플레이어
		this.player.draw(ctx, pal);

		// 속도감 라인 (빨라질수록 뒤로 잔상)
		if (this.state === "playing" && this.speed > 1.35) {
			var footY = this.rope.yAt(CX);
			var lines = Math.min(4, Math.floor((this.speed - 1.1) * 2));
			ctx.fillStyle = "rgba(255,255,255," + (0.14 + 0.09 * this.speed).toFixed(2) + ")";
			for (i = 0; i < lines; i++) {
				var lx = CX - 44 - i * 24 - (this.rope.scroll * 2) % 24;
				ctx.fillRect(Math.round(lx - 24), Math.round(footY - 34 - (i % 3) * 16), 16 + Math.round(this.speed * 4), 2);
			}
		}

		// 비
		if (params.rain > 0) {
			ctx.strokeStyle = "rgba(220,228,228,0.45)";
			ctx.lineWidth = 1;
			ctx.beginPath();
			var rainN = Math.round(this.rain.length * params.rain);
			for (i = 0; i < rainN; i++) {
				var r = this.rain[i];
				ctx.moveTo(r.x, r.y);
				ctx.lineTo(r.x + this.wind.value * 3 - 1, r.y + 11);
			}
			ctx.stroke();
		}

		// UI
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ui.draw(ctx, pal);
	};

	Game.prototype.loop = function (ts) {
		if (!this.isOpen()) { this.raf = null; return; }
		var dt = this.lastTs ? Math.min((ts - this.lastTs) / 1000, 1 / 30) : 1 / 60;
		this.lastTs = ts;
		this.update(dt);
		this.draw();
		var self = this;
		this.raf = requestAnimationFrame(function (t) { self.loop(t); });
	};

	Game.prototype.open = function () {
		this.modal.classList.add("is-open");
		this.modal.setAttribute("aria-hidden", "false");
		this.loadFlags();
		this.loadBillboards();
		this.toReady();
		this.lastTs = 0;
		if (!this.raf) {
			var self = this;
			this.raf = requestAnimationFrame(function (t) { self.loop(t); });
		}
	};

	Game.prototype.closeModal = function () {
		this.modal.classList.remove("is-open");
		this.modal.setAttribute("aria-hidden", "true");
		if (this.formOpen && this.closeNameForm) this.closeNameForm();
		if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
	};

	/* ---------- 초기화 ---------- */
	function init() {
		var modal = document.getElementById("leanModal");
		var canvas = document.getElementById("leanCanvas");
		if (!modal || !canvas) return;

		var game = new Game(modal, canvas);

		var closeBtn = modal.querySelector("[data-game-close]");
		if (closeBtn) closeBtn.addEventListener("click", function () { game.closeModal(); });
		modal.addEventListener("click", function (e) {
			if (e.target === modal) game.closeModal();
		});

		// 닉네임 입력 폼 (첫 기록 제출 시 한 번만)
		var nameForm = document.getElementById("leanNameForm");
		var nameInput = document.getElementById("leanNameInput");
		var nameSave = document.getElementById("leanNameSave");
		var nameSkip = document.getElementById("leanNameSkip");
		if (nameForm && nameInput && nameSave && nameSkip) {
			game.askName = function () {
				game.formOpen = true;
				nameForm.hidden = false;
				nameInput.value = "";
				setTimeout(function () { nameInput.focus(); }, 0);
			};
			game.closeNameForm = function () {
				game.formOpen = false;
				nameForm.hidden = true;
			};
			nameSave.addEventListener("click", function () {
				var v = nameInput.value.trim().slice(0, 12);
				if (!v) { nameInput.focus(); return; }
				storeSet(NAME_KEY, v);
				game.closeNameForm();
				game.submitScore();
			});
			nameSkip.addEventListener("click", function () {
				game.nameSkipped = true;
				game.closeNameForm();
			});
			nameInput.addEventListener("keydown", function (e) {
				e.stopPropagation();
				if (e.key === "Enter") nameSave.click();
				else if (e.key === "Escape") nameSkip.click();
			});
		}

		window.LeanGame = {
			open: function () { game.open(); },
			close: function () { game.closeModal(); },
			_game: game
		};
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
