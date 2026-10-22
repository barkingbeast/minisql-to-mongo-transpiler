"""Verify every pinned review demonstration against the compiler and demo database."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from compiler import DEMO_SCHEMA, transpile
from executor import execute_mql, seeded_database
from inspection import compare_results, inspect_pipeline


class ReviewPresetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.presets = json.loads(subprocess.check_output(
            ['node', '-e', "console.log(JSON.stringify(require('./public/review_queries.js')))"], cwd=ROOT))

    def test_read_queries_match_and_have_pipeline_snapshots(self):
        for preset in self.presets:
            if preset['kind'] != 'query' or 'CREATE TABLE' in preset['sql']:
                continue
            with self.subTest(title=preset['title']):
                db = seeded_database()
                compiled = transpile(preset['sql'], DEMO_SCHEMA)
                self.assertTrue(compiled['success'], compiled)
                result = compare_results(preset['sql'], DEMO_SCHEMA, db)
                self.assertTrue(result['match'], result)
                self.assertGreater(len(result['sql_rows']), 0)
                self.assertGreater(len(inspect_pipeline(preset['sql'], DEMO_SCHEMA, db)['snapshots']), 1)

    def test_intentional_errors_report_correct_phase(self):
        errors = [p for p in self.presets if p['kind'] == 'error']
        self.assertEqual(len(errors), 2)
        phases = set()
        for preset in errors:
            result = transpile(preset['sql'], DEMO_SCHEMA)
            self.assertFalse(result['success'])
            phases.add(result['diagnostic']['phase'])
        self.assertEqual(phases, {'syntax', 'semantic'})

    def test_crud_batch_completes_on_reset_database(self):
        preset = next(p for p in self.presets if p['sql'].startswith('CREATE TABLE review_demo'))
        compiled = transpile(preset['sql'], DEMO_SCHEMA)
        self.assertTrue(compiled['success'], compiled)
        db = seeded_database()
        execute_mql('\n'.join(compiled['mongo_queries']), db)
        self.assertEqual(list(db.review_demo.find({}, {'_id': 0})), [{'id': 2, 'topic': 'AST'}])

    def test_professor_celebration_has_real_create_ast(self):
        preset = next(p for p in self.presets if 'Dr_BASKARAN_P' in p['sql'])
        compiled = transpile(preset['sql'], DEMO_SCHEMA)
        self.assertTrue(compiled['success'])
        self.assertEqual(compiled['ast'][0]['table']['name'], 'Dr_BASKARAN_P')

if __name__ == '__main__':
    unittest.main()
