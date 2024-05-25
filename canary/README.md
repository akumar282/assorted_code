Run `docker compose up` to start the redis instance. Insert the first name by running:
```bash
docker exec -it <<redis_container_name>> redis-cli
> SADD unseen_names <<name>>
```

Run the process by running:
```bash
OUT_DIR="./path/from/root" npm run start
```
