// 本地演示用：模拟 claude.ai Artifact 的 db 能力（内存存储，刷新即重置）。
// 只在 demo.html 中加载；正式页面运行在 claude.ai 上，使用真实的云端数据库。
(function () {
  const store = new Map();
  const listeners = new Set();
  const clone = o => JSON.parse(JSON.stringify(o));
  const notify = () => listeners.forEach(fn => fn());
  const depth = p => p.split('/').length;

  function snapDoc(path) {
    const d = store.get(path);
    return { id: path.split('/').pop(), exists: !!d, data: () => (d ? clone(d) : undefined),
      metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      get: async () => snapDoc(path),
      set: async d => { store.set(path, clone(d)); notify(); },
      update: async d => {
        const cur = store.get(path);
        if (!cur) throw { code: 'invalid_argument', message: 'missing doc' };
        store.set(path, { ...cur, ...clone(d) }); notify();
      },
      delete: async () => { store.delete(path); notify(); },
      acquire: async () => ({ acquired: true }),
      onSnapshot(next) { const fn = () => next(snapDoc(path)); listeners.add(fn); setTimeout(fn); return () => listeners.delete(fn); },
      collection: p => collRef(path + '/' + p)
    };
  }
  const OPS = {
    '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b,
    '>': (a, b) => a > b, '>=': (a, b) => a >= b, 'in': (a, b) => b.includes(a), 'not-in': (a, b) => !b.includes(a),
    'array-contains': (a, b) => Array.isArray(a) && a.includes(b)
  };
  function query(cpath, filters = [], ord = null, lim = null) {
    const run = () => {
      let docs = [...store.keys()]
        .filter(k => k.startsWith(cpath + '/') && depth(k) === depth(cpath) + 1)
        .sort().map(snapDoc)
        .filter(s => filters.every(([f, op, v]) => OPS[op](s.data()[f], v)));
      if (ord) docs.sort((a, b) => {
        const x = a.data()[ord[0]], y = b.data()[ord[0]];
        return (x < y ? -1 : x > y ? 1 : 0) * (ord[1] === 'desc' ? -1 : 1);
      });
      if (lim) docs = docs.slice(0, lim);
      return { docs, size: docs.length, empty: !docs.length, docChanges: () => [],
        metadata: { fromCache: false, hasPendingWrites: false } };
    };
    return {
      where: (f, op, v) => query(cpath, [...filters, [f, op, v]], ord, lim),
      orderBy: (f, d = 'asc') => query(cpath, filters, [f, d], lim),
      limit: n => query(cpath, filters, ord, n),
      get: async () => run(),
      onSnapshot(next) { const fn = () => next(run()); listeners.add(fn); setTimeout(fn); return () => listeners.delete(fn); }
    };
  }
  function collRef(p) {
    return Object.assign(query(p), {
      path: p,
      doc: id => docRef(p + '/' + (id || Math.random().toString(36).slice(2, 12))),
      add: async d => { const r = docRef(p + '/' + Math.random().toString(36).slice(2, 12)); await r.set(d); return r; }
    });
  }
  const db = { doc: docRef, collection: collRef };

  // ---- 示例数据（日期相对于“今天”，按 04:00 刷新计算） ----
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const base = new Date(Date.now() - 4 * 3600e3);
  const day = n => { const d = new Date(base); d.setDate(d.getDate() + n); return fmt(d); };
  const at = (n, h, m) => { const d = new Date(base); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d.getTime(); };
  const T = (id, o) => store.set('tasks/' + id, {
    kind: 'once', routineId: null, status: 'todo', progress: [], notes: [], doneAt: null,
    archived: false, createdAt: at(o.originDate ? 0 : 0, 8, 0), originDate: o.date, ...o });

  store.set('meta/settings', { refreshTime: '04:00', lastRollover: day(0), categories: [
    { id: 'work', name: '工作', color: 'c1' }, { id: 'life', name: '个人', color: 'c2' },
    { id: 'study', name: '学习', color: 'c3' }, { id: 'health', name: '健康', color: 'c4' }] });
  store.set('routines/r1', { title: '晨间计划 15 分钟', cat: 'work', days: [0,1,2,3,4,5,6], active: true, createdAt: 1 });
  store.set('routines/r2', { title: '运动 30 分钟', cat: 'health', days: [1,2,3,4,5], active: true, createdAt: 2 });
  store.set('routines/r3', { title: '背单词 20 个', cat: 'study', days: [0,1,2,3,4,5,6], active: true, createdAt: 3 });

  T('r-r1-' + day(0), { title: '晨间计划 15 分钟', cat: 'work', kind: 'daily', routineId: 'r1', date: day(0), status: 'done', doneAt: at(0, 8, 40) });
  T('r-r2-' + day(0), { title: '运动 30 分钟', cat: 'health', kind: 'daily', routineId: 'r2', date: day(0) });
  T('r-r3-' + day(0), { title: '背单词 20 个', cat: 'study', kind: 'daily', routineId: 'r3', date: day(0), status: 'doing',
    progress: [{ t: at(0, 12, 30), text: '午休背了 12 个' }] });
  T('a1', { title: '整理本周版本测试报告', cat: 'work', date: day(0), status: 'doing',
    progress: [{ t: at(0, 10, 5), text: '已汇总三天的测试数据' }, { t: at(0, 15, 20), text: '图表完成，剩结论部分' }],
    notes: [{ t: at(0, 11, 0), text: '周五前发给项目组' }] });
  T('a2', { title: '回复供应商关于排期的邮件', cat: 'work', date: day(0), originDate: day(-2) });
  T('a3', { title: '预约下周体检', cat: 'life', date: day(0), status: 'done', doneAt: at(0, 9, 15) });
  T('a4', { title: '读完收藏的两篇自动驾驶测试文章', cat: 'study', date: day(0), originDate: day(-1) });
  T('f1', { title: '准备季度复盘材料', cat: 'work', date: day(1) });
  T('f2', { title: '和朋友吃饭', cat: 'life', date: day(3) });
  T('f3', { title: '提交课程作业', cat: 'study', date: day(5) });
  for (let i = 1; i <= 12; i++) {
    T('h' + i + 'a', { title: ['周会纪要', '车辆软件版本核对', '现场巡检记录', '更新交付文档'][i % 4], cat: 'work', date: day(-i), status: 'done', archived: true, doneAt: at(-i, 17, 10) });
    T('h' + i + 'b', { title: '运动 30 分钟', cat: 'health', kind: 'daily', date: day(-i), status: i % 3 ? 'done' : 'todo', missed: !(i % 3), archived: true, doneAt: i % 3 ? at(-i, 19, 0) : null });
    if (i % 2) T('h' + i + 'c', { title: '读书 30 分钟', cat: 'study', date: day(-i), status: 'done', archived: true, doneAt: at(-i, 22, 0) });
  }
  store.set('journal/' + day(0), { notes: [
    { t: at(0, 9, 30), text: '站会：新版本明天上车测试，提前准备回滚方案' },
    { t: at(0, 14, 10), text: '想法：把每周测试结论做成固定模板' }] });

  window.claude = { use: async name => (name === 'db' ? db : null) };
})();
