# /docker

Manage Docker containers and images for the project.

## Arguments
- `action` (required): `up` | `down` | `build` | `logs` | `shell` | `prune` | `status`
- `service` (optional): target a specific service from the compose file (default: all services)

## Steps

### `up`
1. Validate that `{{dockerComposeFile}}` exists in the project root
2. Start all services: `{{dockerComposeCommand}} up -d`
3. Wait for health checks to pass (timeout: 30s)
4. Report the status of all running containers and their exposed ports

### `down`
1. Stop and remove all containers: `{{dockerComposeCommand}} down`
2. Optionally remove volumes if `--volumes` flag is passed: `{{dockerComposeCommand}} down -v`
3. Confirm all containers are stopped

### `build`
1. Build images with no cache if `--fresh` flag is set: `{{dockerComposeCommand}} build --no-cache`
2. Otherwise, build with layer caching: `{{dockerComposeCommand}} build`
3. Report image sizes and build duration
4. Tag images if a version argument is provided

### `logs`
1. If a specific service is provided: `{{dockerComposeCommand}} logs -f --tail=100 {{service}}`
2. Otherwise show recent logs for all services: `{{dockerComposeCommand}} logs --tail=50`
3. Highlight any error-level log lines in the output

### `shell`
1. Identify the target service container
2. Open an interactive shell: `{{dockerComposeCommand}} exec {{service}} {{shellCommand}}`
3. If the service is not running, start it first then attach

### `prune`
1. Remove stopped containers: `docker container prune -f`
2. Remove dangling images: `docker image prune -f`
3. Remove unused volumes (with confirmation): `docker volume prune -f`
4. Remove unused networks: `docker network prune -f`
5. Report total disk space reclaimed

### `status`
1. List all project containers: `{{dockerComposeCommand}} ps`
2. Show resource usage: `docker stats --no-stream --format "table {{{{.Name}}}}\t{{{{.CPUPerc}}}}\t{{{{.MemUsage}}}}\t{{{{.NetIO}}}}"`
3. Check container health status and uptime

## Environment Variables
{{#if envFile}}
- Load environment from `{{envFile}}` when starting services
{{/if}}
- Ensure sensitive values (database passwords, API keys) are sourced from environment variables or secrets, never hardcoded in the compose file

## Constraints
- Never expose database ports to the host in production configurations
- Always use named volumes for persistent data (databases, file uploads)
- Pin image versions in Dockerfiles — never use `latest` in production
- Include health checks for all services that accept network connections
- Do not run containers as root unless absolutely necessary
{{#if dockerRegistry}}
- Push images to `{{dockerRegistry}}` only after a successful build and test pass
{{/if}}
