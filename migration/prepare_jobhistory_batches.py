import csv
import json
import os
import shutil

src = "/Users/grimm/Downloads/JobHistory_export (1).csv"
out = "/private/tmp/jobhistory_batches"
shutil.rmtree(out, ignore_errors=True)
os.makedirs(out)
fields = ["collaborator_id", "duration_minutes", "field", "job_id", "text", "type", "user", "old_value", "new_value", "id", "created_date", "updated_date", "created_by_id", "is_sample"]
prefix = """insert into migration.jobhistory_csv_raw (collaborator_id,duration_minutes,field,job_id,\"text\",type,\"user\",old_value,new_value,id,created_date,updated_date,created_by_id,is_sample)
select collaborator_id,nullif(duration_minutes,'')::numeric,field,job_id,\"text\",type,\"user\",old_value,new_value,id,nullif(created_date,'')::timestamptz,nullif(updated_date,'')::timestamptz,created_by_id,nullif(is_sample,'')::boolean
from jsonb_to_recordset('"""
suffix = """'::jsonb) as x(collaborator_id text,duration_minutes text,field text,job_id text,\"text\" text,type text,\"user\" text,old_value text,new_value text,id text,created_date text,updated_date text,created_by_id text,is_sample text)
on conflict (id) do update set collaborator_id=excluded.collaborator_id,duration_minutes=excluded.duration_minutes,field=excluded.field,job_id=excluded.job_id,\"text\"=excluded.\"text\",type=excluded.type,\"user\"=excluded.\"user\",old_value=excluded.old_value,new_value=excluded.new_value,created_date=excluded.created_date,updated_date=excluded.updated_date,created_by_id=excluded.created_by_id,is_sample=excluded.is_sample;"""

count = batches = 0
batch = []
with open(src, newline="", encoding="utf-8") as handle:
    for row in csv.DictReader(handle):
        batch.append({key: row.get(key, "") for key in fields})
        count += 1
        if len(batch) == 100:
            query = prefix + json.dumps(batch, ensure_ascii=False, separators=(",", ":")).replace("'", "''") + suffix
            with open(f"{out}/{batches:04d}.sql", "w", encoding="utf-8") as output:
                output.write(query)
            batches += 1
            batch = []
if batch:
    with open(f"{out}/{batches:04d}.sql", "w", encoding="utf-8") as output:
        output.write(prefix + json.dumps(batch, ensure_ascii=False, separators=(",", ":")).replace("'", "''") + suffix)
    batches += 1
print(f"rows={count} batches={batches}")
