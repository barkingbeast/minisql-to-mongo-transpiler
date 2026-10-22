"""Bundle the shared Python modules for GitHub Pages or a local static preview."""
from pathlib import Path
from shutil import copy2

root = Path(__file__).resolve().parents[1]
target = root / 'public' / 'src'
target.mkdir(exist_ok=True)
for source in (root / 'src').glob('*.py'):
    copy2(source, target / source.name)
print(f'Bundled compiler modules into {target}')
