import pathlib
src=pathlib.Path('src')
js='\n'.join((src/f).read_text() for f in ['engine.js','charts.js','sync.js','analytics.js','ui.js','views2.js','importxtb.js'])
js=js.replace("if (typeof module !== 'undefined') module.exports = { calc, defaultState, inflIndex, num, has, r2, todayStr };",'')
import datetime
ver=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=1))).strftime('%Y-%m-%d %H:%M')
html=(src/'index.tpl.html').read_text().replace('WERSJA',ver).replace('/*CSS*/',(src/'style.css').read_text()).replace('/*JS*/',js)
pathlib.Path('dist').mkdir(exist_ok=True); (pathlib.Path('dist')/'index.html').write_text(html)
print(len(html))
