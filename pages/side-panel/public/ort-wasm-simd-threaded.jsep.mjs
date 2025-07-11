var ortWasmThreaded = (() => {
  var _scriptName = import.meta.url;

  return async function (moduleArg = {}) {
    var moduleRtn;

    var e = moduleArg,
      aa,
      ca,
      da = new Promise((a, b) => {
        aa = a;
        ca = b;
      }),
      ea = 'object' == typeof window,
      k = 'undefined' != typeof WorkerGlobalScope,
      n =
        'object' == typeof process &&
        'object' == typeof process.versions &&
        'string' == typeof process.versions.node &&
        'renderer' != process.type,
      q = k && self.name?.startsWith('em-pthread');
    if (n) {
      const { createRequire: a } = await import('module');
      var require = a(import.meta.url),
        fa = require('worker_threads');
      global.Worker = fa.Worker;
      q = (k = !fa.oc) && 'em-pthread' == fa.workerData;
    }
    e.mountExternalData = (a, b) => {
      a.startsWith('./') && (a = a.substring(2));
      (e.Eb || (e.Eb = new Map())).set(a, b);
    };
    e.unmountExternalData = () => {
      delete e.Eb;
    };
    var SharedArrayBuffer =
      globalThis.SharedArrayBuffer ??
      new WebAssembly.Memory({ initial: 0, maximum: 0, pc: !0 }).buffer.constructor;
    const ha =
      a =>
      async (...b) => {
        try {
          if (e.Fb) throw Error('Session already started');
          const c = (e.Fb = { dc: b[0], errors: [] }),
            d = await a(...b);
          if (e.Fb !== c) throw Error('Session mismatch');
          e.Jb?.flush();
          const f = c.errors;
          if (0 < f.length) {
            let g = await Promise.all(f);
            g = g.filter(h => h);
            if (0 < g.length) throw Error(g.join('\n'));
          }
          return d;
        } finally {
          e.Fb = null;
        }
      };
    e.jsepInit = (a, b) => {
      if ('webgpu' === a) {
        [e.Jb, e.Ub, e.Yb, e.Kb, e.Xb, e.jb, e.Zb, e.ac, e.Vb, e.Wb, e.$b] = b;
        const c = e.Jb;
        e.jsepRegisterBuffer = (d, f, g, h) => c.registerBuffer(d, f, g, h);
        e.jsepGetBuffer = d => c.getBuffer(d);
        e.jsepCreateDownloader = (d, f, g) => c.createDownloader(d, f, g);
        e.jsepOnCreateSession = d => {
          c.onCreateSession(d);
        };
        e.jsepOnReleaseSession = d => {
          c.onReleaseSession(d);
        };
        e.jsepOnRunStart = d => c.onRunStart(d);
        e.bc = (d, f) => {
          c.upload(d, f);
        };
      } else if ('webnn' === a) {
        const c = b[0];
        [e.nc, e.Nb, e.webnnEnsureTensor, e.Ob, e.webnnDownloadTensor] = b.slice(1);
        e.webnnReleaseTensorId = e.Nb;
        e.webnnUploadTensor = e.Ob;
        e.webnnOnRunStart = d => c.onRunStart(d);
        e.webnnOnRunEnd = c.onRunEnd.bind(c);
        e.webnnRegisterMLContext = (d, f) => {
          c.registerMLContext(d, f);
        };
        e.webnnOnReleaseSession = d => {
          c.onReleaseSession(d);
        };
        e.webnnCreateMLTensorDownloader = (d, f) => c.createMLTensorDownloader(d, f);
        e.webnnRegisterMLTensor = (d, f, g, h) => c.registerMLTensor(d, f, g, h);
        e.webnnCreateMLContext = d => c.createMLContext(d);
        e.webnnRegisterMLConstant = (d, f, g, h, l, m) =>
          c.registerMLConstant(d, f, g, h, l, e.Eb, m);
        e.webnnRegisterGraphInput = c.registerGraphInput.bind(c);
        e.webnnIsGraphInput = c.isGraphInput.bind(c);
        e.webnnCreateTemporaryTensor = c.createTemporaryTensor.bind(c);
        e.webnnIsInt64Supported = c.isInt64Supported.bind(c);
      }
    };
    let ja = () => {
      const a =
        (b, c, d) =>
        (...f) => {
          const g = t,
            h = c?.();
          f = b(...f);
          const l = c?.();
          h !== l && ((b = l), d(h), (c = d = null));
          return t != g ? ia() : f;
        };
      (b => {
        for (const c of b)
          e[c] = a(
            e[c],
            () => e[c],
            d => (e[c] = d),
          );
      })([
        '_OrtAppendExecutionProvider',
        '_OrtCreateSession',
        '_OrtRun',
        '_OrtRunWithBinding',
        '_OrtBindInput',
      ]);
      'undefined' !== typeof ha &&
        ((e._OrtRun = ha(e._OrtRun)), (e._OrtRunWithBinding = ha(e._OrtRunWithBinding)));
      ja = void 0;
    };
    e.asyncInit = () => {
      ja?.();
    };
    var ka = Object.assign({}, e),
      la = './this.program',
      ma = (a, b) => {
        throw b;
      },
      v = '',
      na,
      oa;
    if (n) {
      var fs = require('fs'),
        pa = require('path');
      import.meta.url.startsWith('data:') ||
        (v = pa.dirname(require('url').fileURLToPath(import.meta.url)) + '/');
      oa = a => {
        a = qa(a) ? new URL(a) : a;
        return fs.readFileSync(a);
      };
      na = async a => {
        a = qa(a) ? new URL(a) : a;
        return fs.readFileSync(a, void 0);
      };
      !e.thisProgram && 1 < process.argv.length && (la = process.argv[1].replace(/\\/g, '/'));
      process.argv.slice(2);
      ma = (a, b) => {
        process.exitCode = a;
        throw b;
      };
    } else if (ea || k)
      k
        ? (v = self.location.href)
        : 'undefined' != typeof document &&
          document.currentScript &&
          (v = document.currentScript.src),
        _scriptName && (v = _scriptName),
        v.startsWith('blob:')
          ? (v = '')
          : (v = v.slice(0, v.replace(/[?#].*/, '').lastIndexOf('/') + 1)),
        n ||
          (k &&
            (oa = a => {
              var b = new XMLHttpRequest();
              b.open('GET', a, !1);
              b.responseType = 'arraybuffer';
              b.send(null);
              return new Uint8Array(b.response);
            }),
          (na = async a => {
            if (qa(a))
              return new Promise((c, d) => {
                var f = new XMLHttpRequest();
                f.open('GET', a, !0);
                f.responseType = 'arraybuffer';
                f.onload = () => {
                  200 == f.status || (0 == f.status && f.response) ? c(f.response) : d(f.status);
                };
                f.onerror = d;
                f.send(null);
              });
            var b = await fetch(a, { credentials: 'same-origin' });
            if (b.ok) return b.arrayBuffer();
            throw Error(b.status + ' : ' + b.url);
          }));
    var ra = console.log.bind(console),
      sa = console.error.bind(console);
    n &&
      ((ra = (...a) => fs.writeSync(1, a.join(' ') + '\n')),
      (sa = (...a) => fs.writeSync(2, a.join(' ') + '\n')));
    var ta = ra,
      x = sa;
    Object.assign(e, ka);
    ka = null;
    var ua = e.wasmBinary,
      z,
      va,
      A = !1,
      wa,
      B,
      xa,
      ya,
      za,
      Aa,
      Ba,
      Ca,
      C,
      Da,
      Ea,
      qa = a => a.startsWith('file://');
    function D() {
      z.buffer != B.buffer && E();
      return B;
    }
    function F() {
      z.buffer != B.buffer && E();
      return xa;
    }
    function G() {
      z.buffer != B.buffer && E();
      return ya;
    }
    function Fa() {
      z.buffer != B.buffer && E();
      return za;
    }
    function H() {
      z.buffer != B.buffer && E();
      return Aa;
    }
    function I() {
      z.buffer != B.buffer && E();
      return Ba;
    }
    function Ga() {
      z.buffer != B.buffer && E();
      return Ca;
    }
    function J() {
      z.buffer != B.buffer && E();
      return Ea;
    }
    if (q) {
      var Ha;
      if (n) {
        var Ia = fa.parentPort;
        Ia.on('message', b => onmessage({ data: b }));
        Object.assign(globalThis, { self: global, postMessage: b => Ia.postMessage(b) });
      }
      var Ja = !1;
      x = function (...b) {
        b = b.join(' ');
        n ? fs.writeSync(2, b + '\n') : console.error(b);
      };
      self.alert = function (...b) {
        postMessage({ Bb: 'alert', text: b.join(' '), ic: Ka() });
      };
      self.onunhandledrejection = b => {
        throw b.reason || b;
      };
      function a(b) {
        try {
          var c = b.data,
            d = c.Bb;
          if ('load' === d) {
            let f = [];
            self.onmessage = g => f.push(g);
            self.startWorker = () => {
              postMessage({ Bb: 'loaded' });
              for (let g of f) a(g);
              self.onmessage = a;
            };
            for (const g of c.Rb)
              if (!e[g] || e[g].proxy)
                (e[g] = (...h) => {
                  postMessage({ Bb: 'callHandler', Qb: g, args: h });
                }),
                  'print' == g && (ta = e[g]),
                  'printErr' == g && (x = e[g]);
            z = c.kc;
            E();
            Ha(c.lc);
          } else if ('run' === d) {
            La(c.Ab);
            Ma(c.Ab, 0, 0, 1, 0, 0);
            Na();
            Oa(c.Ab);
            Ja || (Pa(), (Ja = !0));
            try {
              Qa(c.fc, c.Hb);
            } catch (f) {
              if ('unwind' != f) throw f;
            }
          } else
            'setimmediate' !== c.target &&
              ('checkMailbox' === d
                ? Ja && Ra()
                : d && (x(`worker: received unknown command ${d}`), x(c)));
        } catch (f) {
          throw (Sa(), f);
        }
      }
      self.onmessage = a;
    }
    function E() {
      var a = z.buffer;
      e.HEAP8 = B = new Int8Array(a);
      e.HEAP16 = ya = new Int16Array(a);
      e.HEAPU8 = xa = new Uint8Array(a);
      e.HEAPU16 = za = new Uint16Array(a);
      e.HEAP32 = Aa = new Int32Array(a);
      e.HEAPU32 = Ba = new Uint32Array(a);
      e.HEAPF32 = Ca = new Float32Array(a);
      e.HEAPF64 = Ea = new Float64Array(a);
      e.HEAP64 = C = new BigInt64Array(a);
      e.HEAPU64 = Da = new BigUint64Array(a);
    }
    q || ((z = new WebAssembly.Memory({ initial: 256, maximum: 65536, shared: !0 })), E());
    function Ta() {
      q ? startWorker(e) : K.Ca();
    }
    var Ua = 0,
      Va = null;
    function Wa() {
      Ua--;
      if (0 == Ua && Va) {
        var a = Va;
        Va = null;
        a();
      }
    }
    function L(a) {
      a = 'Aborted(' + a + ')';
      x(a);
      A = !0;
      a = new WebAssembly.RuntimeError(a + '. Build with -sASSERTIONS for more info.');
      ca(a);
      throw a;
    }
    var Xa;
    async function Ya(a) {
      if (!ua)
        try {
          var b = await na(a);
          return new Uint8Array(b);
        } catch {}
      if (a == Xa && ua) a = new Uint8Array(ua);
      else if (oa) a = oa(a);
      else throw 'both async and sync fetching of the wasm failed';
      return a;
    }
    async function Za(a, b) {
      try {
        var c = await Ya(a);
        return await WebAssembly.instantiate(c, b);
      } catch (d) {
        x(`failed to asynchronously prepare wasm: ${d}`), L(d);
      }
    }
    async function $a(a) {
      var b = Xa;
      if (!ua && 'function' == typeof WebAssembly.instantiateStreaming && !qa(b) && !n)
        try {
          var c = fetch(b, { credentials: 'same-origin' });
          return await WebAssembly.instantiateStreaming(c, a);
        } catch (d) {
          x(`wasm streaming compile failed: ${d}`), x('falling back to ArrayBuffer instantiation');
        }
      return Za(b, a);
    }
    function ab() {
      bb = {
        L: cb,
        Aa: db,
        b: eb,
        $: fb,
        A: gb,
        pa: hb,
        X: ib,
        Z: jb,
        qa: kb,
        na: lb,
        ga: mb,
        ma: nb,
        J: ob,
        Y: pb,
        V: qb,
        oa: rb,
        W: sb,
        va: tb,
        E: ub,
        Q: vb,
        O: wb,
        D: xb,
        u: yb,
        r: zb,
        P: Ab,
        z: Bb,
        R: Cb,
        ja: Db,
        T: Eb,
        aa: Fb,
        M: Gb,
        F: Hb,
        ia: Oa,
        sa: Ib,
        t: Jb,
        Ba: Kb,
        w: Lb,
        o: Mb,
        l: Nb,
        c: Ob,
        n: Pb,
        j: Qb,
        v: Rb,
        p: Sb,
        f: Tb,
        s: Ub,
        m: Vb,
        e: Wb,
        k: Xb,
        i: Yb,
        g: Zb,
        d: $b,
        da: ac,
        ea: bc,
        fa: cc,
        ba: dc,
        ca: ec,
        N: fc,
        xa: gc,
        ua: hc,
        h: ic,
        C: jc,
        G: kc,
        ta: lc,
        x: mc,
        ra: nc,
        U: oc,
        q: pc,
        y: qc,
        K: rc,
        S: sc,
        za: tc,
        ya: uc,
        ka: vc,
        la: wc,
        _: xc,
        B: yc,
        I: zc,
        ha: Ac,
        H: Bc,
        a: z,
        wa: Cc,
      };
      return { a: bb };
    }
    var Dc = {
      829644: (a, b, c, d, f) => {
        if ('undefined' == typeof e || !e.Eb) return 1;
        a = M(Number(a >>> 0));
        a.startsWith('./') && (a = a.substring(2));
        a = e.Eb.get(a);
        if (!a) return 2;
        b = Number(b >>> 0);
        c = Number(c >>> 0);
        d = Number(d >>> 0);
        if (b + c > a.byteLength) return 3;
        try {
          const g = a.subarray(b, b + c);
          switch (f) {
            case 0:
              F().set(g, d >>> 0);
              break;
            case 1:
              e.mc ? e.mc(d, g) : e.bc(d, g);
              break;
            default:
              return 4;
          }
          return 0;
        } catch {
          return 4;
        }
      },
      830468: (a, b, c) => {
        e.Ob(a, F().subarray(b >>> 0, (b + c) >>> 0));
      },
      830532: () => e.nc(),
      830574: a => {
        e.Nb(a);
      },
      830611: () => {
        e.Vb();
      },
      830642: () => {
        e.Wb();
      },
      830671: () => {
        e.$b();
      },
      830696: a => e.Ub(a),
      830729: a => e.Yb(a),
      830761: (a, b, c) => {
        e.Kb(Number(a), Number(b), Number(c), !0);
      },
      830824: (a, b, c) => {
        e.Kb(Number(a), Number(b), Number(c));
      },
      830881: () => 'undefined' !== typeof wasmOffsetConverter,
      830938: a => {
        e.jb('Abs', a, void 0);
      },
      830989: a => {
        e.jb('Neg', a, void 0);
      },
      831040: a => {
        e.jb('Floor', a, void 0);
      },
      831093: a => {
        e.jb('Ceil', a, void 0);
      },
      831145: a => {
        e.jb('Reciprocal', a, void 0);
      },
      831203: a => {
        e.jb('Sqrt', a, void 0);
      },
      831255: a => {
        e.jb('Exp', a, void 0);
      },
      831306: a => {
        e.jb('Erf', a, void 0);
      },
      831357: a => {
        e.jb('Sigmoid', a, void 0);
      },
      831412: (a, b, c) => {
        e.jb('HardSigmoid', a, { alpha: b, beta: c });
      },
      831491: a => {
        e.jb('Log', a, void 0);
      },
      831542: a => {
        e.jb('Sin', a, void 0);
      },
      831593: a => {
        e.jb('Cos', a, void 0);
      },
      831644: a => {
        e.jb('Tan', a, void 0);
      },
      831695: a => {
        e.jb('Asin', a, void 0);
      },
      831747: a => {
        e.jb('Acos', a, void 0);
      },
      831799: a => {
        e.jb('Atan', a, void 0);
      },
      831851: a => {
        e.jb('Sinh', a, void 0);
      },
      831903: a => {
        e.jb('Cosh', a, void 0);
      },
      831955: a => {
        e.jb('Asinh', a, void 0);
      },
      832008: a => {
        e.jb('Acosh', a, void 0);
      },
      832061: a => {
        e.jb('Atanh', a, void 0);
      },
      832114: a => {
        e.jb('Tanh', a, void 0);
      },
      832166: a => {
        e.jb('Not', a, void 0);
      },
      832217: (a, b, c) => {
        e.jb('Clip', a, { min: b, max: c });
      },
      832286: a => {
        e.jb('Clip', a, void 0);
      },
      832338: (a, b) => {
        e.jb('Elu', a, { alpha: b });
      },
      832396: a => {
        e.jb('Gelu', a, void 0);
      },
      832448: a => {
        e.jb('Relu', a, void 0);
      },
      832500: (a, b) => {
        e.jb('LeakyRelu', a, { alpha: b });
      },
      832564: (a, b) => {
        e.jb('ThresholdedRelu', a, { alpha: b });
      },
      832634: (a, b) => {
        e.jb('Cast', a, { to: b });
      },
      832692: a => {
        e.jb('Add', a, void 0);
      },
      832743: a => {
        e.jb('Sub', a, void 0);
      },
      832794: a => {
        e.jb('Mul', a, void 0);
      },
      832845: a => {
        e.jb('Div', a, void 0);
      },
      832896: a => {
        e.jb('Pow', a, void 0);
      },
      832947: a => {
        e.jb('Equal', a, void 0);
      },
      833e3: a => {
        e.jb('Greater', a, void 0);
      },
      833055: a => {
        e.jb('GreaterOrEqual', a, void 0);
      },
      833117: a => {
        e.jb('Less', a, void 0);
      },
      833169: a => {
        e.jb('LessOrEqual', a, void 0);
      },
      833228: (a, b, c, d, f) => {
        e.jb('ReduceMean', a, {
          keepDims: !!b,
          noopWithEmptyAxes: !!c,
          axes: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
        });
      },
      833403: (a, b, c, d, f) => {
        e.jb('ReduceMax', a, {
          keepDims: !!b,
          noopWithEmptyAxes: !!c,
          axes: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
        });
      },
      833577: (a, b, c, d, f) => {
        e.jb('ReduceMin', a, {
          keepDims: !!b,
          noopWithEmptyAxes: !!c,
          axes: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
        });
      },
      833751: (a, b, c, d, f) => {
        e.jb('ReduceProd', a, {
          keepDims: !!b,
          noopWithEmptyAxes: !!c,
          axes: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
        });
      },
      833926: (a, b, c, d, f) => {
        e.jb('ReduceSum', a, {
          keepDims: !!b,
          noopWithEmptyAxes: !!c,
          axes: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
        });
      },
      834100: (a, b, c, d, f) => {
        e.jb('ReduceL1', a, {
          keepDims: !!b,
          noopWithEmptyAxes: !!c,
          axes: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
        });
      },
      834273: (a, b, c, d, f) => {
        e.jb('ReduceL2', a, {
          keepDims: !!b,
          noopWithEmptyAxes: !!c,
          axes: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
        });
      },
      834446: (a, b, c, d, f) => {
        e.jb('ReduceLogSum', a, {
          keepDims: !!b,
          noopWithEmptyAxes: !!c,
          axes: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
        });
      },
      834623: (a, b, c, d, f) => {
        e.jb('ReduceSumSquare', a, {
          keepDims: !!b,
          noopWithEmptyAxes: !!c,
          axes: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
        });
      },
      834803: (a, b, c, d, f) => {
        e.jb('ReduceLogSumExp', a, {
          keepDims: !!b,
          noopWithEmptyAxes: !!c,
          axes: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
        });
      },
      834983: a => {
        e.jb('Where', a, void 0);
      },
      835036: (a, b, c) => {
        e.jb('Transpose', a, {
          perm: b ? Array.from(H().subarray(Number(b) >>> 0, Number(c) >>> 0)) : [],
        });
      },
      835160: (a, b, c, d) => {
        e.jb('DepthToSpace', a, { blocksize: b, mode: M(c), format: d ? 'NHWC' : 'NCHW' });
      },
      835293: (a, b, c, d) => {
        e.jb('DepthToSpace', a, { blocksize: b, mode: M(c), format: d ? 'NHWC' : 'NCHW' });
      },
      835426: (a, b, c, d, f, g, h, l, m, p, r, u, w, y, ba) => {
        e.jb('ConvTranspose', a, {
          format: m ? 'NHWC' : 'NCHW',
          autoPad: b,
          dilations: [c],
          group: d,
          kernelShape: [f],
          pads: [g, h],
          strides: [l],
          wIsConst: () => !!D()[p >>> 0],
          outputPadding: r ? Array.from(H().subarray(Number(r) >>> 0, Number(u) >>> 0)) : [],
          outputShape: w ? Array.from(H().subarray(Number(w) >>> 0, Number(y) >>> 0)) : [],
          activation: M(ba),
        });
      },
      835859: (a, b, c, d, f, g, h, l, m, p, r, u, w, y) => {
        e.jb('ConvTranspose', a, {
          format: l ? 'NHWC' : 'NCHW',
          autoPad: b,
          dilations: Array.from(H().subarray(Number(c) >>> 0, ((Number(c) >>> 0) + 2) >>> 0)),
          group: d,
          kernelShape: Array.from(H().subarray(Number(f) >>> 0, ((Number(f) >>> 0) + 2) >>> 0)),
          pads: Array.from(H().subarray(Number(g) >>> 0, ((Number(g) >>> 0) + 4) >>> 0)),
          strides: Array.from(H().subarray(Number(h) >>> 0, ((Number(h) >>> 0) + 2) >>> 0)),
          wIsConst: () => !!D()[m >>> 0],
          outputPadding: p ? Array.from(H().subarray(Number(p) >>> 0, Number(r) >>> 0)) : [],
          outputShape: u ? Array.from(H().subarray(Number(u) >>> 0, Number(w) >>> 0)) : [],
          activation: M(y),
        });
      },
      836520: (a, b, c, d, f, g, h, l, m, p, r, u, w, y, ba) => {
        e.jb('ConvTranspose', a, {
          format: m ? 'NHWC' : 'NCHW',
          autoPad: b,
          dilations: [c],
          group: d,
          kernelShape: [f],
          pads: [g, h],
          strides: [l],
          wIsConst: () => !!D()[p >>> 0],
          outputPadding: r ? Array.from(H().subarray(Number(r) >>> 0, Number(u) >>> 0)) : [],
          outputShape: w ? Array.from(H().subarray(Number(w) >>> 0, Number(y) >>> 0)) : [],
          activation: M(ba),
        });
      },
      836953: (a, b, c, d, f, g, h, l, m, p, r, u, w, y) => {
        e.jb('ConvTranspose', a, {
          format: l ? 'NHWC' : 'NCHW',
          autoPad: b,
          dilations: Array.from(H().subarray(Number(c) >>> 0, ((Number(c) >>> 0) + 2) >>> 0)),
          group: d,
          kernelShape: Array.from(H().subarray(Number(f) >>> 0, ((Number(f) >>> 0) + 2) >>> 0)),
          pads: Array.from(H().subarray(Number(g) >>> 0, ((Number(g) >>> 0) + 4) >>> 0)),
          strides: Array.from(H().subarray(Number(h) >>> 0, ((Number(h) >>> 0) + 2) >>> 0)),
          wIsConst: () => !!D()[m >>> 0],
          outputPadding: p ? Array.from(H().subarray(Number(p) >>> 0, Number(r) >>> 0)) : [],
          outputShape: u ? Array.from(H().subarray(Number(u) >>> 0, Number(w) >>> 0)) : [],
          activation: M(y),
        });
      },
      837614: (a, b) => {
        e.jb('GlobalAveragePool', a, { format: b ? 'NHWC' : 'NCHW' });
      },
      837705: (a, b, c, d, f, g, h, l, m, p, r, u, w, y) => {
        e.jb('AveragePool', a, {
          format: y ? 'NHWC' : 'NCHW',
          auto_pad: b,
          ceil_mode: c,
          count_include_pad: d,
          storage_order: f,
          dilations: g ? Array.from(H().subarray(Number(g) >>> 0, Number(h) >>> 0)) : [],
          kernel_shape: l ? Array.from(H().subarray(Number(l) >>> 0, Number(m) >>> 0)) : [],
          pads: p ? Array.from(H().subarray(Number(p) >>> 0, Number(r) >>> 0)) : [],
          strides: u ? Array.from(H().subarray(Number(u) >>> 0, Number(w) >>> 0)) : [],
        });
      },
      838184: (a, b) => {
        e.jb('GlobalAveragePool', a, { format: b ? 'NHWC' : 'NCHW' });
      },
      838275: (a, b, c, d, f, g, h, l, m, p, r, u, w, y) => {
        e.jb('AveragePool', a, {
          format: y ? 'NHWC' : 'NCHW',
          auto_pad: b,
          ceil_mode: c,
          count_include_pad: d,
          storage_order: f,
          dilations: g ? Array.from(H().subarray(Number(g) >>> 0, Number(h) >>> 0)) : [],
          kernel_shape: l ? Array.from(H().subarray(Number(l) >>> 0, Number(m) >>> 0)) : [],
          pads: p ? Array.from(H().subarray(Number(p) >>> 0, Number(r) >>> 0)) : [],
          strides: u ? Array.from(H().subarray(Number(u) >>> 0, Number(w) >>> 0)) : [],
        });
      },
      838754: (a, b) => {
        e.jb('GlobalMaxPool', a, { format: b ? 'NHWC' : 'NCHW' });
      },
      838841: (a, b, c, d, f, g, h, l, m, p, r, u, w, y) => {
        e.jb('MaxPool', a, {
          format: y ? 'NHWC' : 'NCHW',
          auto_pad: b,
          ceil_mode: c,
          count_include_pad: d,
          storage_order: f,
          dilations: g ? Array.from(H().subarray(Number(g) >>> 0, Number(h) >>> 0)) : [],
          kernel_shape: l ? Array.from(H().subarray(Number(l) >>> 0, Number(m) >>> 0)) : [],
          pads: p ? Array.from(H().subarray(Number(p) >>> 0, Number(r) >>> 0)) : [],
          strides: u ? Array.from(H().subarray(Number(u) >>> 0, Number(w) >>> 0)) : [],
        });
      },
      839316: (a, b) => {
        e.jb('GlobalMaxPool', a, { format: b ? 'NHWC' : 'NCHW' });
      },
      839403: (a, b, c, d, f, g, h, l, m, p, r, u, w, y) => {
        e.jb('MaxPool', a, {
          format: y ? 'NHWC' : 'NCHW',
          auto_pad: b,
          ceil_mode: c,
          count_include_pad: d,
          storage_order: f,
          dilations: g ? Array.from(H().subarray(Number(g) >>> 0, Number(h) >>> 0)) : [],
          kernel_shape: l ? Array.from(H().subarray(Number(l) >>> 0, Number(m) >>> 0)) : [],
          pads: p ? Array.from(H().subarray(Number(p) >>> 0, Number(r) >>> 0)) : [],
          strides: u ? Array.from(H().subarray(Number(u) >>> 0, Number(w) >>> 0)) : [],
        });
      },
      839878: (a, b, c, d, f) => {
        e.jb('Gemm', a, { alpha: b, beta: c, transA: d, transB: f });
      },
      839982: a => {
        e.jb('MatMul', a, void 0);
      },
      840036: (a, b, c, d) => {
        e.jb('ArgMax', a, { keepDims: !!b, selectLastIndex: !!c, axis: d });
      },
      840144: (a, b, c, d) => {
        e.jb('ArgMin', a, { keepDims: !!b, selectLastIndex: !!c, axis: d });
      },
      840252: (a, b) => {
        e.jb('Softmax', a, { axis: b });
      },
      840315: (a, b) => {
        e.jb('Concat', a, { axis: b });
      },
      840375: (a, b, c, d, f) => {
        e.jb('Split', a, {
          axis: b,
          numOutputs: c,
          splitSizes: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
        });
      },
      840531: a => {
        e.jb('Expand', a, void 0);
      },
      840585: (a, b) => {
        e.jb('Gather', a, { axis: Number(b) });
      },
      840656: (a, b) => {
        e.jb('GatherElements', a, { axis: Number(b) });
      },
      840735: (a, b) => {
        e.jb('GatherND', a, { batch_dims: Number(b) });
      },
      840814: (a, b, c, d, f, g, h, l, m, p, r) => {
        e.jb('Resize', a, {
          antialias: b,
          axes: c ? Array.from(H().subarray(Number(c) >>> 0, Number(d) >>> 0)) : [],
          coordinateTransformMode: M(f),
          cubicCoeffA: g,
          excludeOutside: h,
          extrapolationValue: l,
          keepAspectRatioPolicy: M(m),
          mode: M(p),
          nearestMode: M(r),
        });
      },
      841176: (a, b, c, d, f, g, h) => {
        e.jb('Slice', a, {
          starts: b ? Array.from(H().subarray(Number(b) >>> 0, Number(c) >>> 0)) : [],
          ends: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
          axes: g ? Array.from(H().subarray(Number(g) >>> 0, Number(h) >>> 0)) : [],
        });
      },
      841440: a => {
        e.jb('Tile', a, void 0);
      },
      841492: (a, b, c) => {
        e.jb('InstanceNormalization', a, { epsilon: b, format: c ? 'NHWC' : 'NCHW' });
      },
      841606: (a, b, c) => {
        e.jb('InstanceNormalization', a, { epsilon: b, format: c ? 'NHWC' : 'NCHW' });
      },
      841720: a => {
        e.jb('Range', a, void 0);
      },
      841773: (a, b) => {
        e.jb('Einsum', a, { equation: M(b) });
      },
      841854: (a, b, c, d, f) => {
        e.jb('Pad', a, {
          mode: b,
          value: c,
          pads: d ? Array.from(H().subarray(Number(d) >>> 0, Number(f) >>> 0)) : [],
        });
      },
      841997: (a, b, c, d, f, g) => {
        e.jb('BatchNormalization', a, {
          epsilon: b,
          momentum: c,
          spatial: !!f,
          trainingMode: !!d,
          format: g ? 'NHWC' : 'NCHW',
        });
      },
      842166: (a, b, c, d, f, g) => {
        e.jb('BatchNormalization', a, {
          epsilon: b,
          momentum: c,
          spatial: !!f,
          trainingMode: !!d,
          format: g ? 'NHWC' : 'NCHW',
        });
      },
      842335: (a, b, c) => {
        e.jb('CumSum', a, { exclusive: Number(b), reverse: Number(c) });
      },
      842432: (a, b, c) => {
        e.jb('DequantizeLinear', a, { axis: b, blockSize: c });
      },
      842522: (a, b, c, d, f) => {
        e.jb('GridSample', a, {
          align_corners: b,
          mode: M(c),
          padding_mode: M(d),
          format: f ? 'NHWC' : 'NCHW',
        });
      },
      842692: (a, b, c, d, f) => {
        e.jb('GridSample', a, {
          align_corners: b,
          mode: M(c),
          padding_mode: M(d),
          format: f ? 'NHWC' : 'NCHW',
        });
      },
      842862: (a, b) => {
        e.jb('ScatterND', a, { reduction: M(b) });
      },
      842947: (a, b, c, d, f, g, h, l, m) => {
        e.jb('Attention', a, {
          numHeads: b,
          isUnidirectional: c,
          maskFilterValue: d,
          scale: f,
          doRotary: g,
          qkvHiddenSizes: h ? Array.from(H().subarray(Number(l) >>> 0, (Number(l) + h) >>> 0)) : [],
          pastPresentShareBuffer: !!m,
        });
      },
      843219: a => {
        e.jb('BiasAdd', a, void 0);
      },
      843274: a => {
        e.jb('BiasSplitGelu', a, void 0);
      },
      843335: a => {
        e.jb('FastGelu', a, void 0);
      },
      843391: (a, b, c, d, f, g, h, l, m, p, r, u, w, y, ba, Vd) => {
        e.jb('Conv', a, {
          format: u ? 'NHWC' : 'NCHW',
          auto_pad: b,
          dilations: c ? Array.from(H().subarray(Number(c) >>> 0, Number(d) >>> 0)) : [],
          group: f,
          kernel_shape: g ? Array.from(H().subarray(Number(g) >>> 0, Number(h) >>> 0)) : [],
          pads: l ? Array.from(H().subarray(Number(l) >>> 0, Number(m) >>> 0)) : [],
          strides: p ? Array.from(H().subarray(Number(p) >>> 0, Number(r) >>> 0)) : [],
          w_is_const: () => !!D()[Number(w) >>> 0],
          activation: M(y),
          activation_params: ba
            ? Array.from(Ga().subarray(Number(ba) >>> 0, Number(Vd) >>> 0))
            : [],
        });
      },
      843975: a => {
        e.jb('Gelu', a, void 0);
      },
      844027: (a, b, c, d, f, g, h, l, m) => {
        e.jb('GroupQueryAttention', a, {
          numHeads: b,
          kvNumHeads: c,
          scale: d,
          softcap: f,
          doRotary: g,
          rotaryInterleaved: h,
          smoothSoftmax: l,
          localWindowSize: m,
        });
      },
      844244: (a, b, c, d) => {
        e.jb('LayerNormalization', a, { axis: b, epsilon: c, simplified: !!d });
      },
      844355: (a, b, c, d) => {
        e.jb('LayerNormalization', a, { axis: b, epsilon: c, simplified: !!d });
      },
      844466: (a, b, c, d, f, g) => {
        e.jb('MatMulNBits', a, { k: b, n: c, accuracyLevel: d, bits: f, blockSize: g });
      },
      844593: (a, b, c, d, f, g) => {
        e.jb('MultiHeadAttention', a, {
          numHeads: b,
          isUnidirectional: c,
          maskFilterValue: d,
          scale: f,
          doRotary: g,
        });
      },
      844752: (a, b) => {
        e.jb('QuickGelu', a, { alpha: b });
      },
      844816: (a, b, c, d, f) => {
        e.jb('RotaryEmbedding', a, {
          interleaved: !!b,
          numHeads: c,
          rotaryEmbeddingDim: d,
          scale: f,
        });
      },
      844955: (a, b, c) => {
        e.jb('SkipLayerNormalization', a, { epsilon: b, simplified: !!c });
      },
      845057: (a, b, c) => {
        e.jb('SkipLayerNormalization', a, { epsilon: b, simplified: !!c });
      },
      845159: (a, b, c, d) => {
        e.jb('GatherBlockQuantized', a, { gatherAxis: b, quantizeAxis: c, blockSize: d });
      },
      845280: a => {
        e.Zb(a);
      },
      845314: (a, b) => e.ac(Number(a), Number(b), e.Fb.dc, e.Fb.errors),
    };
    function db(a, b, c) {
      return Ec(async () => {
        await e.Xb(Number(a), Number(b), Number(c));
      });
    }
    function cb() {
      return 'undefined' !== typeof wasmOffsetConverter;
    }
    class Fc {
      name = 'ExitStatus';
      constructor(a) {
        this.message = `Program terminated with exit(${a})`;
        this.status = a;
      }
    }
    var Gc = a => {
        a.terminate();
        a.onmessage = () => {};
      },
      Hc = [],
      Lc = a => {
        0 == N.length && (Ic(), Jc(N[0]));
        var b = N.pop();
        if (!b) return 6;
        Kc.push(b);
        O[a.Ab] = b;
        b.Ab = a.Ab;
        var c = { Bb: 'run', fc: a.ec, Hb: a.Hb, Ab: a.Ab };
        n && b.unref();
        b.postMessage(c, a.Mb);
        return 0;
      },
      P = 0,
      Q = (a, b, ...c) => {
        for (var d = 2 * c.length, f = Mc(), g = Nc(8 * d), h = g >>> 3, l = 0; l < c.length; l++) {
          var m = c[l];
          'bigint' == typeof m
            ? ((C[h + 2 * l] = 1n), (C[h + 2 * l + 1] = m))
            : ((C[h + 2 * l] = 0n), (J()[(h + 2 * l + 1) >>> 0] = m));
        }
        a = Oc(a, 0, d, g, b);
        Pc(f);
        return a;
      };
    function Cc(a) {
      if (q) return Q(0, 1, a);
      wa = a;
      if (!(0 < P)) {
        for (var b of Kc) Gc(b);
        for (b of N) Gc(b);
        N = [];
        Kc = [];
        O = {};
        A = !0;
      }
      ma(a, new Fc(a));
    }
    function Qc(a) {
      if (q) return Q(1, 0, a);
      xc(a);
    }
    var xc = a => {
        wa = a;
        if (q) throw (Qc(a), 'unwind');
        Cc(a);
      },
      N = [],
      Kc = [],
      Rc = [],
      O = {};
    function Sc() {
      for (var a = e.numThreads - 1; a--; ) Ic();
      Hc.unshift(() => {
        Ua++;
        Tc(() => Wa());
      });
    }
    var Vc = a => {
      var b = a.Ab;
      delete O[b];
      N.push(a);
      Kc.splice(Kc.indexOf(a), 1);
      a.Ab = 0;
      Uc(b);
    };
    function Na() {
      Rc.forEach(a => a());
    }
    var Jc = a =>
      new Promise(b => {
        a.onmessage = g => {
          g = g.data;
          var h = g.Bb;
          if (g.Gb && g.Gb != Ka()) {
            var l = O[g.Gb];
            l
              ? l.postMessage(g, g.Mb)
              : x(
                  `Internal error! Worker sent a message "${h}" to target pthread ${g.Gb}, but that thread no longer exists!`,
                );
          } else if ('checkMailbox' === h) Ra();
          else if ('spawnThread' === h) Lc(g);
          else if ('cleanupThread' === h) Vc(O[g.hc]);
          else if ('loaded' === h) (a.loaded = !0), n && !a.Ab && a.unref(), b(a);
          else if ('alert' === h) alert(`Thread ${g.ic}: ${g.text}`);
          else if ('setimmediate' === g.target) a.postMessage(g);
          else if ('callHandler' === h) e[g.Qb](...g.args);
          else h && x(`worker sent an unknown command ${h}`);
        };
        a.onerror = g => {
          x(`${'worker sent an error!'} ${g.filename}:${g.lineno}: ${g.message}`);
          throw g;
        };
        n && (a.on('message', g => a.onmessage({ data: g })), a.on('error', g => a.onerror(g)));
        var c = [],
          d = [],
          f;
        for (f of d) e.propertyIsEnumerable(f) && c.push(f);
        a.postMessage({ Bb: 'load', Rb: c, kc: z, lc: va });
      });
    function Tc(a) {
      q ? a() : Promise.all(N.map(Jc)).then(a);
    }
    function Ic() {
      var a = new Worker(new URL(import.meta.url), {
        type: 'module',
        workerData: 'em-pthread',
        name: 'em-pthread',
      });
      N.push(a);
    }
    var La = a => {
        E();
        var b = I()[((a + 52) >>> 2) >>> 0];
        a = I()[((a + 56) >>> 2) >>> 0];
        Wc(b, b - a);
        Pc(b);
      },
      Qa = (a, b) => {
        P = 0;
        a = Xc(a, b);
        0 < P ? (wa = a) : Yc(a);
      };
    class Zc {
      constructor(a) {
        this.Ib = a - 24;
      }
    }
    var $c = 0,
      ad = 0;
    function eb(a, b, c) {
      a >>>= 0;
      var d = new Zc(a);
      b >>>= 0;
      c >>>= 0;
      I()[((d.Ib + 16) >>> 2) >>> 0] = 0;
      I()[((d.Ib + 4) >>> 2) >>> 0] = b;
      I()[((d.Ib + 8) >>> 2) >>> 0] = c;
      $c = a;
      ad++;
      throw $c;
    }
    function bd(a, b, c, d) {
      return q ? Q(2, 1, a, b, c, d) : fb(a, b, c, d);
    }
    function fb(a, b, c, d) {
      a >>>= 0;
      b >>>= 0;
      c >>>= 0;
      d >>>= 0;
      if ('undefined' == typeof SharedArrayBuffer) return 6;
      var f = [];
      if (q && 0 === f.length) return bd(a, b, c, d);
      a = { ec: c, Ab: a, Hb: d, Mb: f };
      return q ? ((a.Bb = 'spawnThread'), postMessage(a, f), 0) : Lc(a);
    }
    var cd = 'undefined' != typeof TextDecoder ? new TextDecoder() : void 0,
      dd = (a, b = 0, c = NaN) => {
        b >>>= 0;
        var d = b + c;
        for (c = b; a[c] && !(c >= d); ) ++c;
        if (16 < c - b && a.buffer && cd)
          return cd.decode(a.buffer instanceof ArrayBuffer ? a.subarray(b, c) : a.slice(b, c));
        for (d = ''; b < c; ) {
          var f = a[b++];
          if (f & 128) {
            var g = a[b++] & 63;
            if (192 == (f & 224)) d += String.fromCharCode(((f & 31) << 6) | g);
            else {
              var h = a[b++] & 63;
              f =
                224 == (f & 240)
                  ? ((f & 15) << 12) | (g << 6) | h
                  : ((f & 7) << 18) | (g << 12) | (h << 6) | (a[b++] & 63);
              65536 > f
                ? (d += String.fromCharCode(f))
                : ((f -= 65536), (d += String.fromCharCode(55296 | (f >> 10), 56320 | (f & 1023))));
            }
          } else d += String.fromCharCode(f);
        }
        return d;
      },
      M = (a, b) => ((a >>>= 0) ? dd(F(), a, b) : '');
    function gb(a, b, c) {
      return q ? Q(3, 1, a, b, c) : 0;
    }
    function hb(a, b) {
      if (q) return Q(4, 1, a, b);
    }
    var ed = a => {
        for (var b = 0, c = 0; c < a.length; ++c) {
          var d = a.charCodeAt(c);
          127 >= d
            ? b++
            : 2047 >= d
              ? (b += 2)
              : 55296 <= d && 57343 >= d
                ? ((b += 4), ++c)
                : (b += 3);
        }
        return b;
      },
      fd = (a, b, c) => {
        var d = F();
        b >>>= 0;
        if (0 < c) {
          var f = b;
          c = b + c - 1;
          for (var g = 0; g < a.length; ++g) {
            var h = a.charCodeAt(g);
            if (55296 <= h && 57343 >= h) {
              var l = a.charCodeAt(++g);
              h = (65536 + ((h & 1023) << 10)) | (l & 1023);
            }
            if (127 >= h) {
              if (b >= c) break;
              d[b++ >>> 0] = h;
            } else {
              if (2047 >= h) {
                if (b + 1 >= c) break;
                d[b++ >>> 0] = 192 | (h >> 6);
              } else {
                if (65535 >= h) {
                  if (b + 2 >= c) break;
                  d[b++ >>> 0] = 224 | (h >> 12);
                } else {
                  if (b + 3 >= c) break;
                  d[b++ >>> 0] = 240 | (h >> 18);
                  d[b++ >>> 0] = 128 | ((h >> 12) & 63);
                }
                d[b++ >>> 0] = 128 | ((h >> 6) & 63);
              }
              d[b++ >>> 0] = 128 | (h & 63);
            }
          }
          d[b >>> 0] = 0;
          a = b - f;
        } else a = 0;
        return a;
      };
    function ib(a, b) {
      if (q) return Q(5, 1, a, b);
    }
    function jb(a, b, c) {
      if (q) return Q(6, 1, a, b, c);
    }
    function kb(a, b, c) {
      return q ? Q(7, 1, a, b, c) : 0;
    }
    function lb(a, b) {
      if (q) return Q(8, 1, a, b);
    }
    function mb(a, b, c) {
      if (q) return Q(9, 1, a, b, c);
    }
    function nb(a, b, c, d) {
      if (q) return Q(10, 1, a, b, c, d);
    }
    function ob(a, b, c, d) {
      if (q) return Q(11, 1, a, b, c, d);
    }
    function pb(a, b, c, d) {
      if (q) return Q(12, 1, a, b, c, d);
    }
    function qb(a) {
      if (q) return Q(13, 1, a);
    }
    function rb(a, b) {
      if (q) return Q(14, 1, a, b);
    }
    function sb(a, b, c) {
      if (q) return Q(15, 1, a, b, c);
    }
    var tb = () => L(''),
      gd,
      R = a => {
        for (var b = ''; F()[a >>> 0]; ) b += gd[F()[a++ >>> 0]];
        return b;
      },
      hd = {},
      jd = {},
      kd = {},
      S;
    function ld(a, b, c = {}) {
      var d = b.name;
      if (!a) throw new S(`type "${d}" must have a positive integer typeid pointer`);
      if (jd.hasOwnProperty(a)) {
        if (c.Sb) return;
        throw new S(`Cannot register type '${d}' twice`);
      }
      jd[a] = b;
      delete kd[a];
      hd.hasOwnProperty(a) && ((b = hd[a]), delete hd[a], b.forEach(f => f()));
    }
    function T(a, b, c = {}) {
      return ld(a, b, c);
    }
    var md = (a, b, c) => {
      switch (b) {
        case 1:
          return c ? d => D()[d >>> 0] : d => F()[d >>> 0];
        case 2:
          return c ? d => G()[(d >>> 1) >>> 0] : d => Fa()[(d >>> 1) >>> 0];
        case 4:
          return c ? d => H()[(d >>> 2) >>> 0] : d => I()[(d >>> 2) >>> 0];
        case 8:
          return c ? d => C[d >>> 3] : d => Da[d >>> 3];
        default:
          throw new TypeError(`invalid integer width (${b}): ${a}`);
      }
    };
    function ub(a, b, c) {
      a >>>= 0;
      c >>>= 0;
      b = R(b >>> 0);
      T(a, {
        name: b,
        fromWireType: d => d,
        toWireType: function (d, f) {
          if ('bigint' != typeof f && 'number' != typeof f)
            throw (
              (null === f
                ? (f = 'null')
                : ((d = typeof f),
                  (f =
                    'object' === d || 'array' === d || 'function' === d ? f.toString() : '' + f)),
              new TypeError(`Cannot convert "${f}" to ${this.name}`))
            );
          'number' == typeof f && (f = BigInt(f));
          return f;
        },
        Cb: U,
        readValueFromPointer: md(b, c, -1 == b.indexOf('u')),
        Db: null,
      });
    }
    var U = 8;
    function vb(a, b, c, d) {
      a >>>= 0;
      b = R(b >>> 0);
      T(a, {
        name: b,
        fromWireType: function (f) {
          return !!f;
        },
        toWireType: function (f, g) {
          return g ? c : d;
        },
        Cb: U,
        readValueFromPointer: function (f) {
          return this.fromWireType(F()[f >>> 0]);
        },
        Db: null,
      });
    }
    var nd = [],
      V = [];
    function Ob(a) {
      a >>>= 0;
      9 < a && 0 === --V[a + 1] && ((V[a] = void 0), nd.push(a));
    }
    var W = a => {
        if (!a) throw new S('Cannot use deleted val. handle = ' + a);
        return V[a];
      },
      X = a => {
        switch (a) {
          case void 0:
            return 2;
          case null:
            return 4;
          case !0:
            return 6;
          case !1:
            return 8;
          default:
            const b = nd.pop() || V.length;
            V[b] = a;
            V[b + 1] = 1;
            return b;
        }
      };
    function od(a) {
      return this.fromWireType(I()[(a >>> 2) >>> 0]);
    }
    var pd = {
      name: 'emscripten::val',
      fromWireType: a => {
        var b = W(a);
        Ob(a);
        return b;
      },
      toWireType: (a, b) => X(b),
      Cb: U,
      readValueFromPointer: od,
      Db: null,
    };
    function wb(a) {
      return T(a >>> 0, pd);
    }
    var qd = (a, b) => {
      switch (b) {
        case 4:
          return function (c) {
            return this.fromWireType(Ga()[(c >>> 2) >>> 0]);
          };
        case 8:
          return function (c) {
            return this.fromWireType(J()[(c >>> 3) >>> 0]);
          };
        default:
          throw new TypeError(`invalid float width (${b}): ${a}`);
      }
    };
    function xb(a, b, c) {
      a >>>= 0;
      c >>>= 0;
      b = R(b >>> 0);
      T(a, {
        name: b,
        fromWireType: d => d,
        toWireType: (d, f) => f,
        Cb: U,
        readValueFromPointer: qd(b, c),
        Db: null,
      });
    }
    function yb(a, b, c, d, f) {
      a >>>= 0;
      c >>>= 0;
      b = R(b >>> 0);
      -1 === f && (f = 4294967295);
      f = l => l;
      if (0 === d) {
        var g = 32 - 8 * c;
        f = l => (l << g) >>> g;
      }
      var h = b.includes('unsigned')
        ? function (l, m) {
            return m >>> 0;
          }
        : function (l, m) {
            return m;
          };
      T(a, {
        name: b,
        fromWireType: f,
        toWireType: h,
        Cb: U,
        readValueFromPointer: md(b, c, 0 !== d),
        Db: null,
      });
    }
    function zb(a, b, c) {
      function d(g) {
        var h = I()[(g >>> 2) >>> 0];
        g = I()[((g + 4) >>> 2) >>> 0];
        return new f(D().buffer, g, h);
      }
      a >>>= 0;
      var f = [
        Int8Array,
        Uint8Array,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array,
        BigInt64Array,
        BigUint64Array,
      ][b];
      c = R(c >>> 0);
      T(a, { name: c, fromWireType: d, Cb: U, readValueFromPointer: d }, { Sb: !0 });
    }
    function Ab(a, b) {
      a >>>= 0;
      b = R(b >>> 0);
      T(a, {
        name: b,
        fromWireType: function (c) {
          for (var d = I()[(c >>> 2) >>> 0], f = c + 4, g, h = f, l = 0; l <= d; ++l) {
            var m = f + l;
            if (l == d || 0 == F()[m >>> 0])
              (h = M(h, m - h)),
                void 0 === g ? (g = h) : ((g += String.fromCharCode(0)), (g += h)),
                (h = m + 1);
          }
          Y(c);
          return g;
        },
        toWireType: function (c, d) {
          d instanceof ArrayBuffer && (d = new Uint8Array(d));
          var f = 'string' == typeof d;
          if (
            !(
              f ||
              d instanceof Uint8Array ||
              d instanceof Uint8ClampedArray ||
              d instanceof Int8Array
            )
          )
            throw new S('Cannot pass non-string to std::string');
          var g = f ? ed(d) : d.length;
          var h = rd(4 + g + 1),
            l = h + 4;
          I()[(h >>> 2) >>> 0] = g;
          if (f) fd(d, l, g + 1);
          else if (f)
            for (f = 0; f < g; ++f) {
              var m = d.charCodeAt(f);
              if (255 < m)
                throw (Y(h), new S('String has UTF-16 code units that do not fit in 8 bits'));
              F()[(l + f) >>> 0] = m;
            }
          else for (f = 0; f < g; ++f) F()[(l + f) >>> 0] = d[f];
          null !== c && c.push(Y, h);
          return h;
        },
        Cb: U,
        readValueFromPointer: od,
        Db(c) {
          Y(c);
        },
      });
    }
    var sd = 'undefined' != typeof TextDecoder ? new TextDecoder('utf-16le') : void 0,
      td = (a, b) => {
        var c = a >> 1;
        for (var d = c + b / 2; !(c >= d) && Fa()[c >>> 0]; ) ++c;
        c <<= 1;
        if (32 < c - a && sd) return sd.decode(F().slice(a, c));
        c = '';
        for (d = 0; !(d >= b / 2); ++d) {
          var f = G()[((a + 2 * d) >>> 1) >>> 0];
          if (0 == f) break;
          c += String.fromCharCode(f);
        }
        return c;
      },
      ud = (a, b, c) => {
        c ??= 2147483647;
        if (2 > c) return 0;
        c -= 2;
        var d = b;
        c = c < 2 * a.length ? c / 2 : a.length;
        for (var f = 0; f < c; ++f) {
          var g = a.charCodeAt(f);
          G()[(b >>> 1) >>> 0] = g;
          b += 2;
        }
        G()[(b >>> 1) >>> 0] = 0;
        return b - d;
      },
      vd = a => 2 * a.length,
      wd = (a, b) => {
        for (var c = 0, d = ''; !(c >= b / 4); ) {
          var f = H()[((a + 4 * c) >>> 2) >>> 0];
          if (0 == f) break;
          ++c;
          65536 <= f
            ? ((f -= 65536), (d += String.fromCharCode(55296 | (f >> 10), 56320 | (f & 1023))))
            : (d += String.fromCharCode(f));
        }
        return d;
      },
      xd = (a, b, c) => {
        b >>>= 0;
        c ??= 2147483647;
        if (4 > c) return 0;
        var d = b;
        c = d + c - 4;
        for (var f = 0; f < a.length; ++f) {
          var g = a.charCodeAt(f);
          if (55296 <= g && 57343 >= g) {
            var h = a.charCodeAt(++f);
            g = (65536 + ((g & 1023) << 10)) | (h & 1023);
          }
          H()[(b >>> 2) >>> 0] = g;
          b += 4;
          if (b + 4 > c) break;
        }
        H()[(b >>> 2) >>> 0] = 0;
        return b - d;
      },
      yd = a => {
        for (var b = 0, c = 0; c < a.length; ++c) {
          var d = a.charCodeAt(c);
          55296 <= d && 57343 >= d && ++c;
          b += 4;
        }
        return b;
      };
    function Bb(a, b, c) {
      a >>>= 0;
      b >>>= 0;
      c >>>= 0;
      c = R(c);
      if (2 === b) {
        var d = td;
        var f = ud;
        var g = vd;
        var h = l => Fa()[(l >>> 1) >>> 0];
      } else 4 === b && ((d = wd), (f = xd), (g = yd), (h = l => I()[(l >>> 2) >>> 0]));
      T(a, {
        name: c,
        fromWireType: l => {
          for (var m = I()[(l >>> 2) >>> 0], p, r = l + 4, u = 0; u <= m; ++u) {
            var w = l + 4 + u * b;
            if (u == m || 0 == h(w))
              (r = d(r, w - r)),
                void 0 === p ? (p = r) : ((p += String.fromCharCode(0)), (p += r)),
                (r = w + b);
          }
          Y(l);
          return p;
        },
        toWireType: (l, m) => {
          if ('string' != typeof m) throw new S(`Cannot pass non-string to C++ string type ${c}`);
          var p = g(m),
            r = rd(4 + p + b);
          I()[(r >>> 2) >>> 0] = p / b;
          f(m, r + 4, p + b);
          null !== l && l.push(Y, r);
          return r;
        },
        Cb: U,
        readValueFromPointer: od,
        Db(l) {
          Y(l);
        },
      });
    }
    function Cb(a, b) {
      a >>>= 0;
      b = R(b >>> 0);
      T(a, { Tb: !0, name: b, Cb: 0, fromWireType: () => {}, toWireType: () => {} });
    }
    function Db(a) {
      Ma(a >>> 0, !k, 1, !ea, 131072, !1);
      Na();
    }
    var zd = a => {
      if (!A)
        try {
          if ((a(), !(0 < P)))
            try {
              q ? Yc(wa) : xc(wa);
            } catch (b) {
              b instanceof Fc || 'unwind' == b || ma(1, b);
            }
        } catch (b) {
          b instanceof Fc || 'unwind' == b || ma(1, b);
        }
    };
    function Oa(a) {
      a >>>= 0;
      'function' === typeof Atomics.jc &&
        (Atomics.jc(H(), a >>> 2, a).value.then(Ra), (a += 128), Atomics.store(H(), a >>> 2, 1));
    }
    var Ra = () => {
      var a = Ka();
      a && (Oa(a), zd(Ad));
    };
    function Eb(a, b) {
      a >>>= 0;
      a == b >>> 0
        ? setTimeout(Ra)
        : q
          ? postMessage({ Gb: a, Bb: 'checkMailbox' })
          : (a = O[a]) && a.postMessage({ Bb: 'checkMailbox' });
    }
    var Bd = [];
    function Fb(a, b, c, d, f) {
      b >>>= 0;
      d /= 2;
      Bd.length = d;
      c = (f >>> 0) >>> 3;
      for (f = 0; f < d; f++) Bd[f] = C[c + 2 * f] ? C[c + 2 * f + 1] : J()[(c + 2 * f + 1) >>> 0];
      return (b ? Dc[b] : Cd[a])(...Bd);
    }
    var Gb = () => {
      P = 0;
    };
    function Hb(a) {
      a >>>= 0;
      q ? postMessage({ Bb: 'cleanupThread', hc: a }) : Vc(O[a]);
    }
    function Ib(a) {
      n && O[a >>> 0].ref();
    }
    var Ed = (a, b) => {
        var c = jd[a];
        if (void 0 === c)
          throw ((a = Dd(a)), (c = R(a)), Y(a), new S(`${b} has unknown type ${c}`));
        return c;
      },
      Fd = (a, b, c) => {
        var d = [];
        a = a.toWireType(d, c);
        d.length && (I()[(b >>> 2) >>> 0] = X(d));
        return a;
      };
    function Jb(a, b, c) {
      b >>>= 0;
      c >>>= 0;
      a = W(a >>> 0);
      b = Ed(b, 'emval::as');
      return Fd(b, c, a);
    }
    function Kb(a, b) {
      b >>>= 0;
      a = W(a >>> 0);
      b = Ed(b, 'emval::as');
      return b.toWireType(null, a);
    }
    var Gd = a => {
      try {
        a();
      } catch (b) {
        L(b);
      }
    };
    function Hd() {
      var a = K,
        b = {};
      for (let [c, d] of Object.entries(a))
        b[c] =
          'function' == typeof d
            ? (...f) => {
                Id.push(c);
                try {
                  return d(...f);
                } finally {
                  A ||
                    (Id.pop(),
                    t &&
                      1 === Z &&
                      0 === Id.length &&
                      ((Z = 0), (P += 1), Gd(Jd), 'undefined' != typeof Fibers && Fibers.rc()));
                }
              }
            : d;
      return b;
    }
    var Z = 0,
      t = null,
      Kd = 0,
      Id = [],
      Ld = {},
      Md = {},
      Nd = 0,
      Od = null,
      Pd = [];
    function ia() {
      return new Promise((a, b) => {
        Od = { resolve: a, reject: b };
      });
    }
    function Qd() {
      var a = rd(65548),
        b = a + 12;
      I()[(a >>> 2) >>> 0] = b;
      I()[((a + 4) >>> 2) >>> 0] = b + 65536;
      b = Id[0];
      var c = Ld[b];
      void 0 === c && ((c = Nd++), (Ld[b] = c), (Md[c] = b));
      b = c;
      H()[((a + 8) >>> 2) >>> 0] = b;
      return a;
    }
    function Rd() {
      var a = H()[((t + 8) >>> 2) >>> 0];
      a = K[Md[a]];
      --P;
      return a();
    }
    function Sd(a) {
      if (!A) {
        if (0 === Z) {
          var b = !1,
            c = !1;
          a((d = 0) => {
            if (!A && ((Kd = d), (b = !0), c)) {
              Z = 2;
              Gd(() => Td(t));
              'undefined' != typeof MainLoop && MainLoop.Pb && MainLoop.resume();
              d = !1;
              try {
                var f = Rd();
              } catch (l) {
                (f = l), (d = !0);
              }
              var g = !1;
              if (!t) {
                var h = Od;
                h && ((Od = null), (d ? h.reject : h.resolve)(f), (g = !0));
              }
              if (d && !g) throw f;
            }
          });
          c = !0;
          b ||
            ((Z = 1),
            (t = Qd()),
            'undefined' != typeof MainLoop && MainLoop.Pb && MainLoop.pause(),
            Gd(() => Ud(t)));
        } else
          2 === Z ? ((Z = 0), Gd(Wd), Y(t), (t = null), Pd.forEach(zd)) : L(`invalid state: ${Z}`);
        return Kd;
      }
    }
    function Ec(a) {
      return Sd(b => {
        a().then(b);
      });
    }
    function Lb(a) {
      a >>>= 0;
      return Ec(async () => {
        var b = await W(a);
        return X(b);
      });
    }
    var Xd = [];
    function Mb(a, b, c, d) {
      c >>>= 0;
      d >>>= 0;
      a = Xd[a >>> 0];
      b = W(b >>> 0);
      return a(null, b, c, d);
    }
    var Yd = {},
      Zd = a => {
        var b = Yd[a];
        return void 0 === b ? R(a) : b;
      };
    function Nb(a, b, c, d, f) {
      c >>>= 0;
      d >>>= 0;
      f >>>= 0;
      a = Xd[a >>> 0];
      b = W(b >>> 0);
      c = Zd(c);
      return a(b, b[c], d, f);
    }
    var $d = () => ('object' == typeof globalThis ? globalThis : Function('return this')());
    function Pb(a) {
      a >>>= 0;
      if (0 === a) return X($d());
      a = Zd(a);
      return X($d()[a]);
    }
    var ae = a => {
        var b = Xd.length;
        Xd.push(a);
        return b;
      },
      be = (a, b) => {
        for (var c = Array(a), d = 0; d < a; ++d)
          c[d] = Ed(I()[((b + 4 * d) >>> 2) >>> 0], 'parameter ' + d);
        return c;
      },
      ce = (a, b) => Object.defineProperty(b, 'name', { value: a });
    function de(a) {
      var b = Function;
      if (!(b instanceof Function))
        throw new TypeError(
          `new_ called with constructor type ${typeof b} which is not a function`,
        );
      var c = ce(b.name || 'unknownFunctionName', function () {});
      c.prototype = b.prototype;
      c = new c();
      a = b.apply(c, a);
      return a instanceof Object ? a : c;
    }
    function Qb(a, b, c) {
      b = be(a, b >>> 0);
      var d = b.shift();
      a--;
      var f = 'return function (obj, func, destructorsRef, args) {\n',
        g = 0,
        h = [];
      0 === c && h.push('obj');
      for (var l = ['retType'], m = [d], p = 0; p < a; ++p)
        h.push('arg' + p),
          l.push('argType' + p),
          m.push(b[p]),
          (f += `  var arg${p} = argType${p}.readValueFromPointer(args${g ? '+' + g : ''});\n`),
          (g += b[p].Cb);
      f += `  var rv = ${1 === c ? 'new func' : 'func.call'}(${h.join(', ')});\n`;
      d.Tb ||
        (l.push('emval_returnValue'),
        m.push(Fd),
        (f += '  return emval_returnValue(retType, destructorsRef, rv);\n'));
      l.push(f + '};\n');
      a = de(l)(...m);
      c = `methodCaller<(${b.map(r => r.name).join(', ')}) => ${d.name}>`;
      return ae(ce(c, a));
    }
    function Rb(a) {
      a = Zd(a >>> 0);
      return X(e[a]);
    }
    function Sb(a, b) {
      b >>>= 0;
      a = W(a >>> 0);
      b = W(b);
      return X(a[b]);
    }
    function Tb(a) {
      a >>>= 0;
      9 < a && (V[a + 1] += 1);
    }
    function Ub() {
      return X([]);
    }
    function Vb(a) {
      a = W(a >>> 0);
      for (var b = Array(a.length), c = 0; c < a.length; c++) b[c] = a[c];
      return X(b);
    }
    function Wb(a) {
      return X(Zd(a >>> 0));
    }
    function Xb() {
      return X({});
    }
    function Yb(a) {
      a >>>= 0;
      for (var b = W(a); b.length; ) {
        var c = b.pop();
        b.pop()(c);
      }
      Ob(a);
    }
    function Zb(a, b, c) {
      b >>>= 0;
      c >>>= 0;
      a = W(a >>> 0);
      b = W(b);
      c = W(c);
      a[b] = c;
    }
    function $b(a, b) {
      b >>>= 0;
      a = Ed(a >>> 0, '_emval_take_value');
      a = a.readValueFromPointer(b);
      return X(a);
    }
    function ac(a, b) {
      a = -9007199254740992 > a || 9007199254740992 < a ? NaN : Number(a);
      b >>>= 0;
      a = new Date(1e3 * a);
      H()[(b >>> 2) >>> 0] = a.getUTCSeconds();
      H()[((b + 4) >>> 2) >>> 0] = a.getUTCMinutes();
      H()[((b + 8) >>> 2) >>> 0] = a.getUTCHours();
      H()[((b + 12) >>> 2) >>> 0] = a.getUTCDate();
      H()[((b + 16) >>> 2) >>> 0] = a.getUTCMonth();
      H()[((b + 20) >>> 2) >>> 0] = a.getUTCFullYear() - 1900;
      H()[((b + 24) >>> 2) >>> 0] = a.getUTCDay();
      a = ((a.getTime() - Date.UTC(a.getUTCFullYear(), 0, 1, 0, 0, 0, 0)) / 864e5) | 0;
      H()[((b + 28) >>> 2) >>> 0] = a;
    }
    var ee = a => 0 === a % 4 && (0 !== a % 100 || 0 === a % 400),
      fe = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335],
      ge = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    function bc(a, b) {
      a = -9007199254740992 > a || 9007199254740992 < a ? NaN : Number(a);
      b >>>= 0;
      a = new Date(1e3 * a);
      H()[(b >>> 2) >>> 0] = a.getSeconds();
      H()[((b + 4) >>> 2) >>> 0] = a.getMinutes();
      H()[((b + 8) >>> 2) >>> 0] = a.getHours();
      H()[((b + 12) >>> 2) >>> 0] = a.getDate();
      H()[((b + 16) >>> 2) >>> 0] = a.getMonth();
      H()[((b + 20) >>> 2) >>> 0] = a.getFullYear() - 1900;
      H()[((b + 24) >>> 2) >>> 0] = a.getDay();
      var c = ((ee(a.getFullYear()) ? fe : ge)[a.getMonth()] + a.getDate() - 1) | 0;
      H()[((b + 28) >>> 2) >>> 0] = c;
      H()[((b + 36) >>> 2) >>> 0] = -(60 * a.getTimezoneOffset());
      c = new Date(a.getFullYear(), 6, 1).getTimezoneOffset();
      var d = new Date(a.getFullYear(), 0, 1).getTimezoneOffset();
      a = (c != d && a.getTimezoneOffset() == Math.min(d, c)) | 0;
      H()[((b + 32) >>> 2) >>> 0] = a;
    }
    function cc(a) {
      a >>>= 0;
      var b = new Date(
          H()[((a + 20) >>> 2) >>> 0] + 1900,
          H()[((a + 16) >>> 2) >>> 0],
          H()[((a + 12) >>> 2) >>> 0],
          H()[((a + 8) >>> 2) >>> 0],
          H()[((a + 4) >>> 2) >>> 0],
          H()[(a >>> 2) >>> 0],
          0,
        ),
        c = H()[((a + 32) >>> 2) >>> 0],
        d = b.getTimezoneOffset(),
        f = new Date(b.getFullYear(), 6, 1).getTimezoneOffset(),
        g = new Date(b.getFullYear(), 0, 1).getTimezoneOffset(),
        h = Math.min(g, f);
      0 > c
        ? (H()[((a + 32) >>> 2) >>> 0] = Number(f != g && h == d))
        : 0 < c != (h == d) &&
          ((f = Math.max(g, f)), b.setTime(b.getTime() + 6e4 * ((0 < c ? h : f) - d)));
      H()[((a + 24) >>> 2) >>> 0] = b.getDay();
      c = ((ee(b.getFullYear()) ? fe : ge)[b.getMonth()] + b.getDate() - 1) | 0;
      H()[((a + 28) >>> 2) >>> 0] = c;
      H()[(a >>> 2) >>> 0] = b.getSeconds();
      H()[((a + 4) >>> 2) >>> 0] = b.getMinutes();
      H()[((a + 8) >>> 2) >>> 0] = b.getHours();
      H()[((a + 12) >>> 2) >>> 0] = b.getDate();
      H()[((a + 16) >>> 2) >>> 0] = b.getMonth();
      H()[((a + 20) >>> 2) >>> 0] = b.getYear();
      a = b.getTime();
      return BigInt(isNaN(a) ? -1 : a / 1e3);
    }
    function dc(a, b, c, d, f, g, h) {
      return q ? Q(16, 1, a, b, c, d, f, g, h) : -52;
    }
    function ec(a, b, c, d, f, g) {
      if (q) return Q(17, 1, a, b, c, d, f, g);
    }
    var he = {},
      pc = () => performance.timeOrigin + performance.now();
    function fc(a, b) {
      if (q) return Q(18, 1, a, b);
      he[a] && (clearTimeout(he[a].id), delete he[a]);
      if (!b) return 0;
      var c = setTimeout(() => {
        delete he[a];
        zd(() => ie(a, performance.timeOrigin + performance.now()));
      }, b);
      he[a] = { id: c, qc: b };
      return 0;
    }
    function gc(a, b, c, d) {
      a >>>= 0;
      b >>>= 0;
      c >>>= 0;
      d >>>= 0;
      var f = new Date().getFullYear(),
        g = new Date(f, 0, 1).getTimezoneOffset();
      f = new Date(f, 6, 1).getTimezoneOffset();
      var h = Math.max(g, f);
      I()[(a >>> 2) >>> 0] = 60 * h;
      H()[(b >>> 2) >>> 0] = Number(g != f);
      b = l => {
        var m = Math.abs(l);
        return `UTC${0 <= l ? '-' : '+'}${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;
      };
      a = b(g);
      b = b(f);
      f < g ? (fd(a, c, 17), fd(b, d, 17)) : (fd(a, d, 17), fd(b, c, 17));
    }
    var lc = () => Date.now(),
      je = 1;
    function hc(a, b, c) {
      if (!(0 <= a && 3 >= a)) return 28;
      if (0 === a) a = Date.now();
      else if (je) a = performance.timeOrigin + performance.now();
      else return 52;
      C[(c >>> 0) >>> 3] = BigInt(Math.round(1e6 * a));
      return 0;
    }
    var ke = [],
      le = (a, b) => {
        ke.length = 0;
        for (var c; (c = F()[a++ >>> 0]); ) {
          var d = 105 != c;
          d &= 112 != c;
          b += d && b % 8 ? 4 : 0;
          ke.push(
            112 == c
              ? I()[(b >>> 2) >>> 0]
              : 106 == c
                ? C[b >>> 3]
                : 105 == c
                  ? H()[(b >>> 2) >>> 0]
                  : J()[(b >>> 3) >>> 0],
          );
          b += d ? 8 : 4;
        }
        return ke;
      };
    function ic(a, b, c) {
      a >>>= 0;
      b = le(b >>> 0, c >>> 0);
      return Dc[a](...b);
    }
    function jc(a, b, c) {
      a >>>= 0;
      b = le(b >>> 0, c >>> 0);
      return Dc[a](...b);
    }
    var kc = () => {};
    function mc(a, b) {
      return x(M(a >>> 0, b >>> 0));
    }
    var nc = () => {
      P += 1;
      throw 'unwind';
    };
    function oc() {
      return 4294901760;
    }
    var qc = () => (n ? require('os').cpus().length : navigator.hardwareConcurrency);
    function rc() {
      L('Cannot use emscripten_pc_get_function without -sUSE_OFFSET_CONVERTER');
      return 0;
    }
    function sc(a) {
      a >>>= 0;
      var b = F().length;
      if (a <= b || 4294901760 < a) return !1;
      for (var c = 1; 4 >= c; c *= 2) {
        var d = b * (1 + 0.2 / c);
        d = Math.min(d, a + 100663296);
        a: {
          d =
            ((Math.min(4294901760, 65536 * Math.ceil(Math.max(a, d) / 65536)) -
              z.buffer.byteLength +
              65535) /
              65536) |
            0;
          try {
            z.grow(d);
            E();
            var f = 1;
            break a;
          } catch (g) {}
          f = void 0;
        }
        if (f) return !0;
      }
      return !1;
    }
    var me = () => {
        L(
          'Cannot use convertFrameToPC (needed by __builtin_return_address) without -sUSE_OFFSET_CONVERTER',
        );
        return 0;
      },
      ne = {},
      oe = a => {
        a.forEach(b => {
          var c = me();
          c && (ne[c] = b);
        });
      };
    function tc() {
      var a = Error().stack.toString().split('\n');
      'Error' == a[0] && a.shift();
      oe(a);
      ne.Lb = me();
      ne.cc = a;
      return ne.Lb;
    }
    function uc(a, b, c) {
      a >>>= 0;
      b >>>= 0;
      if (ne.Lb == a) var d = ne.cc;
      else (d = Error().stack.toString().split('\n')), 'Error' == d[0] && d.shift(), oe(d);
      for (var f = 3; d[f] && me() != a; ) ++f;
      for (a = 0; a < c && d[a + f]; ++a) H()[((b + 4 * a) >>> 2) >>> 0] = me();
      return a;
    }
    var pe = {},
      re = () => {
        if (!qe) {
          var a = {
              USER: 'web_user',
              LOGNAME: 'web_user',
              PATH: '/',
              PWD: '/',
              HOME: '/home/web_user',
              LANG:
                (
                  ('object' == typeof navigator && navigator.languages && navigator.languages[0]) ||
                  'C'
                ).replace('-', '_') + '.UTF-8',
              _: la || './this.program',
            },
            b;
          for (b in pe) void 0 === pe[b] ? delete a[b] : (a[b] = pe[b]);
          var c = [];
          for (b in a) c.push(`${b}=${a[b]}`);
          qe = c;
        }
        return qe;
      },
      qe;
    function vc(a, b) {
      if (q) return Q(19, 1, a, b);
      a >>>= 0;
      b >>>= 0;
      var c = 0;
      re().forEach((d, f) => {
        var g = b + c;
        f = I()[((a + 4 * f) >>> 2) >>> 0] = g;
        for (g = 0; g < d.length; ++g) D()[f++ >>> 0] = d.charCodeAt(g);
        D()[f >>> 0] = 0;
        c += d.length + 1;
      });
      return 0;
    }
    function wc(a, b) {
      if (q) return Q(20, 1, a, b);
      a >>>= 0;
      b >>>= 0;
      var c = re();
      I()[(a >>> 2) >>> 0] = c.length;
      var d = 0;
      c.forEach(f => (d += f.length + 1));
      I()[(b >>> 2) >>> 0] = d;
      return 0;
    }
    function yc(a) {
      return q ? Q(21, 1, a) : 52;
    }
    function zc(a, b, c, d) {
      return q ? Q(22, 1, a, b, c, d) : 52;
    }
    function Ac(a, b, c, d) {
      return q ? Q(23, 1, a, b, c, d) : 70;
    }
    var se = [null, [], []];
    function Bc(a, b, c, d) {
      if (q) return Q(24, 1, a, b, c, d);
      b >>>= 0;
      c >>>= 0;
      d >>>= 0;
      for (var f = 0, g = 0; g < c; g++) {
        var h = I()[(b >>> 2) >>> 0],
          l = I()[((b + 4) >>> 2) >>> 0];
        b += 8;
        for (var m = 0; m < l; m++) {
          var p = F()[(h + m) >>> 0],
            r = se[a];
          0 === p || 10 === p ? ((1 === a ? ta : x)(dd(r)), (r.length = 0)) : r.push(p);
        }
        f += l;
      }
      I()[(d >>> 2) >>> 0] = f;
      return 0;
    }
    q || Sc();
    for (var te = Array(256), ue = 0; 256 > ue; ++ue) te[ue] = String.fromCharCode(ue);
    gd = te;
    S = e.BindingError = class extends Error {
      constructor(a) {
        super(a);
        this.name = 'BindingError';
      }
    };
    e.InternalError = class extends Error {
      constructor(a) {
        super(a);
        this.name = 'InternalError';
      }
    };
    V.push(0, 1, void 0, 1, null, 1, !0, 1, !1, 1);
    e.count_emval_handles = () => V.length / 2 - 5 - nd.length;
    var Cd = [
        Cc,
        Qc,
        bd,
        gb,
        hb,
        ib,
        jb,
        kb,
        lb,
        mb,
        nb,
        ob,
        pb,
        qb,
        rb,
        sb,
        dc,
        ec,
        fc,
        vc,
        wc,
        yc,
        zc,
        Ac,
        Bc,
      ],
      bb,
      K;
    (async function () {
      function a(d, f) {
        K = d.exports;
        K = Hd();
        K = ve();
        Rc.push(K.ib);
        va = f;
        Wa();
        return K;
      }
      Ua++;
      var b = ab();
      if (e.instantiateWasm)
        return new Promise(d => {
          e.instantiateWasm(b, (f, g) => {
            a(f, g);
            d(f.exports);
          });
        });
      if (q)
        return new Promise(d => {
          Ha = f => {
            var g = new WebAssembly.Instance(f, ab());
            d(a(g, f));
          };
        });
      Xa ??= e.locateFile
        ? e.locateFile
          ? e.locateFile('ort-wasm-simd-threaded.jsep.wasm', v)
          : v + 'ort-wasm-simd-threaded.jsep.wasm'
        : new URL('ort-wasm-simd-threaded.jsep.wasm', import.meta.url).href;
      try {
        var c = await $a(b);
        return a(c.instance, c.module);
      } catch (d) {
        return ca(d), Promise.reject(d);
      }
    })();
    var Dd = a => (Dd = K.Da)(a),
      Pa = () => (Pa = K.Ea)();
    e._OrtInit = (a, b) => (e._OrtInit = K.Fa)(a, b);
    e._OrtGetLastError = (a, b) => (e._OrtGetLastError = K.Ga)(a, b);
    e._OrtCreateSessionOptions = (a, b, c, d, f, g, h, l, m, p) =>
      (e._OrtCreateSessionOptions = K.Ha)(a, b, c, d, f, g, h, l, m, p);
    e._OrtAppendExecutionProvider = (a, b, c, d, f) =>
      (e._OrtAppendExecutionProvider = K.Ia)(a, b, c, d, f);
    e._OrtAddFreeDimensionOverride = (a, b, c) => (e._OrtAddFreeDimensionOverride = K.Ja)(a, b, c);
    e._OrtAddSessionConfigEntry = (a, b, c) => (e._OrtAddSessionConfigEntry = K.Ka)(a, b, c);
    e._OrtReleaseSessionOptions = a => (e._OrtReleaseSessionOptions = K.La)(a);
    e._OrtCreateSession = (a, b, c) => (e._OrtCreateSession = K.Ma)(a, b, c);
    e._OrtReleaseSession = a => (e._OrtReleaseSession = K.Na)(a);
    e._OrtGetInputOutputCount = (a, b, c) => (e._OrtGetInputOutputCount = K.Oa)(a, b, c);
    e._OrtGetInputOutputMetadata = (a, b, c, d) =>
      (e._OrtGetInputOutputMetadata = K.Pa)(a, b, c, d);
    e._OrtFree = a => (e._OrtFree = K.Qa)(a);
    e._OrtCreateTensor = (a, b, c, d, f, g) => (e._OrtCreateTensor = K.Ra)(a, b, c, d, f, g);
    e._OrtGetTensorData = (a, b, c, d, f) => (e._OrtGetTensorData = K.Sa)(a, b, c, d, f);
    e._OrtReleaseTensor = a => (e._OrtReleaseTensor = K.Ta)(a);
    e._OrtCreateRunOptions = (a, b, c, d) => (e._OrtCreateRunOptions = K.Ua)(a, b, c, d);
    e._OrtAddRunConfigEntry = (a, b, c) => (e._OrtAddRunConfigEntry = K.Va)(a, b, c);
    e._OrtReleaseRunOptions = a => (e._OrtReleaseRunOptions = K.Wa)(a);
    e._OrtCreateBinding = a => (e._OrtCreateBinding = K.Xa)(a);
    e._OrtBindInput = (a, b, c) => (e._OrtBindInput = K.Ya)(a, b, c);
    e._OrtBindOutput = (a, b, c, d) => (e._OrtBindOutput = K.Za)(a, b, c, d);
    e._OrtClearBoundOutputs = a => (e._OrtClearBoundOutputs = K._a)(a);
    e._OrtReleaseBinding = a => (e._OrtReleaseBinding = K.$a)(a);
    e._OrtRunWithBinding = (a, b, c, d, f) => (e._OrtRunWithBinding = K.ab)(a, b, c, d, f);
    e._OrtRun = (a, b, c, d, f, g, h, l) => (e._OrtRun = K.bb)(a, b, c, d, f, g, h, l);
    e._OrtEndProfiling = a => (e._OrtEndProfiling = K.cb)(a);
    e._JsepOutput = (a, b, c) => (e._JsepOutput = K.db)(a, b, c);
    e._JsepGetNodeName = a => (e._JsepGetNodeName = K.eb)(a);
    var Ka = () => (Ka = K.fb)(),
      Y = (e._free = a => (Y = e._free = K.gb)(a)),
      rd = (e._malloc = a => (rd = e._malloc = K.hb)(a)),
      Ma = (a, b, c, d, f, g) => (Ma = K.kb)(a, b, c, d, f, g),
      Sa = () => (Sa = K.lb)(),
      Oc = (a, b, c, d, f) => (Oc = K.mb)(a, b, c, d, f),
      Uc = a => (Uc = K.nb)(a),
      Yc = a => (Yc = K.ob)(a),
      ie = (a, b) => (ie = K.pb)(a, b),
      Ad = () => (Ad = K.qb)(),
      Wc = (a, b) => (Wc = K.rb)(a, b),
      Pc = a => (Pc = K.sb)(a),
      Nc = a => (Nc = K.tb)(a),
      Mc = () => (Mc = K.ub)(),
      Xc = (e.dynCall_ii = (a, b) => (Xc = e.dynCall_ii = K.vb)(a, b)),
      Ud = a => (Ud = K.wb)(a),
      Jd = () => (Jd = K.xb)(),
      Td = a => (Td = K.yb)(a),
      Wd = () => (Wd = K.zb)();
    function ve() {
      var a = K;
      a = Object.assign({}, a);
      var b = d => f => d(f) >>> 0,
        c = d => () => d() >>> 0;
      a.Da = b(a.Da);
      a.fb = c(a.fb);
      a.hb = b(a.hb);
      a.tb = b(a.tb);
      a.ub = c(a.ub);
      a.__cxa_get_exception_ptr = b(a.__cxa_get_exception_ptr);
      return a;
    }
    e.stackSave = () => Mc();
    e.stackRestore = a => Pc(a);
    e.stackAlloc = a => Nc(a);
    e.setValue = function (a, b, c = 'i8') {
      c.endsWith('*') && (c = '*');
      switch (c) {
        case 'i1':
          D()[a >>> 0] = b;
          break;
        case 'i8':
          D()[a >>> 0] = b;
          break;
        case 'i16':
          G()[(a >>> 1) >>> 0] = b;
          break;
        case 'i32':
          H()[(a >>> 2) >>> 0] = b;
          break;
        case 'i64':
          C[a >>> 3] = BigInt(b);
          break;
        case 'float':
          Ga()[(a >>> 2) >>> 0] = b;
          break;
        case 'double':
          J()[(a >>> 3) >>> 0] = b;
          break;
        case '*':
          I()[(a >>> 2) >>> 0] = b;
          break;
        default:
          L(`invalid type for setValue: ${c}`);
      }
    };
    e.getValue = function (a, b = 'i8') {
      b.endsWith('*') && (b = '*');
      switch (b) {
        case 'i1':
          return D()[a >>> 0];
        case 'i8':
          return D()[a >>> 0];
        case 'i16':
          return G()[(a >>> 1) >>> 0];
        case 'i32':
          return H()[(a >>> 2) >>> 0];
        case 'i64':
          return C[a >>> 3];
        case 'float':
          return Ga()[(a >>> 2) >>> 0];
        case 'double':
          return J()[(a >>> 3) >>> 0];
        case '*':
          return I()[(a >>> 2) >>> 0];
        default:
          L(`invalid type for getValue: ${b}`);
      }
    };
    e.UTF8ToString = M;
    e.stringToUTF8 = fd;
    e.lengthBytesUTF8 = ed;
    function we() {
      if (0 < Ua) Va = we;
      else if (q) aa(e), Ta();
      else {
        for (; 0 < Hc.length; ) Hc.shift()(e);
        0 < Ua ? (Va = we) : ((e.calledRun = !0), A || (Ta(), aa(e)));
      }
    }
    we();
    e.PTR_SIZE = 4;
    moduleRtn = da;

    return moduleRtn;
  };
})();
export default ortWasmThreaded;
var isPthread = globalThis.self?.name?.startsWith('em-pthread');
var isNode = typeof globalThis.process?.versions?.node == 'string';
if (isNode) isPthread = (await import('worker_threads')).workerData === 'em-pthread';

// When running as a pthread, construct a new instance on startup
isPthread && ortWasmThreaded();
