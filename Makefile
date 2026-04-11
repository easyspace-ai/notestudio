.PHONY: help build run test test-config clean docker-build-app docker-build-docreader docker-build-frontend docker-build-all docker-run migrate-up migrate-down docker-restart docker-stop start-all stop-all start-ollama stop-ollama build-images build-images-app build-images-docreader build-images-frontend clean-images check-env list-containers pull-images show-platform dev-start dev-stop dev-restart dev-logs dev-status dev-app dev-frontend docs install-swagger build-web build-admin-web build-bin

# Show help
help:
	@echo "WeKnora Makefile 帮助"
	@echo ""
	@echo "基础命令:"
	@echo "  build             构建应用（二进制输出到 bin/$(BINARY_NAME)，与 build-bin 路径一致）"
	@echo "  build-web         构建主站 React → bin/frontend/"
	@echo "  build-admin-web   构建管理端 Vue → bin/admin/（base=/admin/）"
	@echo "  build-bin         构建前后端到 bin/（WeKnora + frontend + admin）"
	@echo "  run               运行应用"
	@echo "  test              运行全部 Go 测试（可能含历史失败用例）"
	@echo "  test-config       仅跑 internal/config（平台存储回归，推荐日常）"
	@echo "  clean             清理构建文件"
	@echo ""
	@echo "Docker 命令:"
	@echo "  docker-build-app       构建应用 Docker 镜像 (wechatopenai/weknora-app)"
	@echo "  docker-build-docreader 构建文档读取器镜像 (wechatopenai/weknora-docreader)"
	@echo "  docker-build-frontend  构建前端镜像 (wechatopenai/weknora-ui)"
	@echo "  docker-build-all       构建所有 Docker 镜像"
	@echo "  docker-run            运行 Docker 容器"
	@echo "  docker-stop           停止 Docker 容器"
	@echo "  docker-restart        重启 Docker 容器"
	@echo ""
	@echo "服务管理:"
	@echo "  start-all         启动所有服务"
	@echo "  stop-all          停止所有服务"
	@echo "  start-ollama      仅启动 Ollama 服务"
	@echo ""
	@echo "镜像构建:"
	@echo "  build-images      从源码构建所有镜像"
	@echo "  build-images-app  从源码构建应用镜像"
	@echo "  build-images-docreader 从源码构建文档读取器镜像"
	@echo "  build-images-frontend  从源码构建前端镜像"
	@echo "  clean-images      清理本地镜像"
	@echo ""
	@echo "数据库:"
	@echo "  migrate-up        执行数据库迁移"
	@echo "  migrate-down      回滚数据库迁移"
	@echo ""
	@echo "开发工具:"
	@echo "  fmt               格式化代码"
	@echo "  lint              代码检查"
	@echo "  deps              安装依赖"
	@echo "  docs              生成 Swagger API 文档"
	@echo "  install-swagger   安装 swag 工具"
	@echo ""
	@echo "环境检查:"
	@echo "  check-env         检查环境配置"
	@echo "  list-containers   列出运行中的容器"
	@echo "  pull-images       拉取最新镜像"
	@echo "  show-platform     显示当前构建平台"
	@echo ""
	@echo "开发模式（推荐）:"
	@echo "  dev-start         启动开发环境基础设施（仅启动依赖服务）"
	@echo "  dev-stop          停止开发环境"
	@echo "  dev-restart       重启开发环境"
	@echo "  dev-logs          查看开发环境日志"
	@echo "  dev-status        查看开发环境状态"
	@echo "  dev-app           启动后端应用（本地运行，需先运行 dev-start）"
	@echo "  dev-frontend      启动前端（本地运行，需先运行 dev-start）"

# Go related variables
BINARY_NAME=metanote
MAIN_PATH=./cmd/server

# Docker related variables
DOCKER_IMAGE=wechatopenai/weknora-app
DOCKER_TAG=latest

# Platform detection
ifeq ($(shell uname -m),x86_64)
    PLATFORM=linux/amd64
else ifeq ($(shell uname -m),aarch64)
    PLATFORM=linux/arm64
else ifeq ($(shell uname -m),arm64)
    PLATFORM=linux/arm64
else
    PLATFORM=linux/amd64
endif

# Clang（macOS）编译 go-m1cpu 等 CGO 依赖时会出现 -Wgnu-folding-constant；GCC 不认该选项故仅 Darwin 追加
CGO_OPT_CFLAGS := -Wno-deprecated-declarations
ifeq ($(shell uname -s),Darwin)
CGO_OPT_CFLAGS += -Wno-gnu-folding-constant
endif

# sqlite-vec 需要 SQLITE_INNOCUOUS（SQLite 3.31+）；旧版 sqlite3.h 无该宏。检测用 grep SQLITE_INNOCUOUS，避免 Makefile 将 # 当作注释。
NEED_SQLITE_INNOC_DEF := $(shell test -f /usr/include/sqlite3.h && ! grep -q SQLITE_INNOCUOUS /usr/include/sqlite3.h && echo 1)
ifneq ($(strip $(NEED_SQLITE_INNOC_DEF)),)
CGO_OPT_CFLAGS += -DSQLITE_INNOCUOUS=0x000200000
endif

# Milvus 与 Qdrant 的 gRPC 生成代码均注册同名 common.proto，默认会 panic（见 protobuf FAQ）
PROTO_CONFLICT_LDFLAG := -X google.golang.org/protobuf/reflect/protoregistry.conflictPolicy=warn

# 主站前端（Vite outDir 已为 ../bin/frontend）
build-web:
	cd frontend && pnpm install && pnpm run build

# 管理端（挂到服务端 /admin；与后端同域时走相对 /api）
build-admin-web:
	cd admin && npm install && VITE_IS_DOCKER=true npm run build

# 二进制 + 静态资源，便于单机部署：WEKNORA_SERVE_WEB=1 或存在 bin/frontend/index.html 时由 Go 托管 / 与 /admin
build-bin: build-web build-admin-web
	mkdir -p bin
	CGO_ENABLED=1 CGO_CFLAGS="$(CGO_OPT_CFLAGS)" CGO_LDFLAGS="-Wl,-no_warn_duplicate_libraries" \
		go build -ldflags="$(PROTO_CONFLICT_LDFLAG)" -o bin/$(BINARY_NAME) $(MAIN_PATH)

# Build the application（输出到 bin/，避免与未带 ldflags 的旧 ./bin/WeKnora 混淆）
build:
	mkdir -p bin
	CGO_ENABLED=1 CGO_CFLAGS="$(CGO_OPT_CFLAGS)" CGO_LDFLAGS="-Wl,-no_warn_duplicate_libraries" \
		go build -ldflags="$(PROTO_CONFLICT_LDFLAG)" -o bin/$(BINARY_NAME) $(MAIN_PATH)

# Run the application
run: build
	./bin/$(BINARY_NAME)

# Run tests (entire repo; some packages may fail — use test-config for stable CI parity)
test:
	go test -count=1 -timeout=15m ./...

# Fast regression: config / platform storage (same as CI job test-config-storage)
test-config:
	go test -count=1 -timeout=5m -v ./internal/config/...

# Clean build artifacts
clean:
	go clean
	rm -f $(BINARY_NAME) bin/$(BINARY_NAME)

# Build Docker image
docker-build-app:
	@echo "获取版本信息..."
	@eval $$(./scripts/get_version.sh env); \
	./scripts/get_version.sh info; \
	docker build --platform $(PLATFORM) \
		--build-arg VERSION_ARG="$$VERSION" \
		--build-arg COMMIT_ID_ARG="$$COMMIT_ID" \
		--build-arg BUILD_TIME_ARG="$$BUILD_TIME" \
		--build-arg GO_VERSION_ARG="$$GO_VERSION" \
		-f docker/Dockerfile.app -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

# Build docreader Docker image
docker-build-docreader:
	docker build --platform $(PLATFORM) -f docker/Dockerfile.docreader -t wechatopenai/weknora-docreader:latest .

# Build frontend Docker image
docker-build-frontend:
	docker build --platform $(PLATFORM) -f frontend/Dockerfile -t wechatopenai/weknora-ui:latest frontend/

# Build all Docker images
docker-build-all: docker-build-app docker-build-docreader docker-build-frontend

# Run Docker container (传统方式)
docker-run:
	docker-compose up

# 使用新脚本启动所有服务
start-all:
	./scripts/start_all.sh

# 使用新脚本仅启动Ollama服务
start-ollama:
	./scripts/start_all.sh --ollama

# 使用新脚本仅启动Docker容器
start-docker:
	./scripts/start_all.sh --docker

# 使用新脚本停止所有服务
stop-all:
	./scripts/start_all.sh --stop

# Stop Docker container (传统方式)
docker-stop:
	docker-compose down

# 从源码构建镜像相关命令
build-images:
	./scripts/build_images.sh

build-images-app:
	./scripts/build_images.sh --app

build-images-docreader:
	./scripts/build_images.sh --docreader

build-images-frontend:
	./scripts/build_images.sh --frontend

clean-images:
	./scripts/build_images.sh --clean

# Restart Docker container (stop, start)
docker-restart:
	docker-compose stop -t 60
	docker-compose up

# Database migrations
migrate-up:
	./scripts/migrate.sh up

migrate-down:
	./scripts/migrate.sh down

migrate-version:
	./scripts/migrate.sh version

migrate-create:
	@if [ -z "$(name)" ]; then \
		echo "Error: migration name is required"; \
		echo "Usage: make migrate-create name=your_migration_name"; \
		exit 1; \
	fi
	./scripts/migrate.sh create $(name)

migrate-force:
	@if [ -z "$(version)" ]; then \
		echo "Error: version is required"; \
		echo "Usage: make migrate-force version=4"; \
		exit 1; \
	fi
	./scripts/migrate.sh force $(version)

migrate-goto:
	@if [ -z "$(version)" ]; then \
		echo "Error: version is required"; \
		echo "Usage: make migrate-goto version=3"; \
		exit 1; \
	fi
	./scripts/migrate.sh goto $(version)

# Generate API documentation (Swagger)
docs:
	@echo "生成 Swagger API 文档..."
	swag init -g $(MAIN_PATH)/main.go -o ./docs --parseDependency --parseInternal
	@echo "文档已生成到 ./docs 目录"
	@echo "启动服务后访问 http://localhost:8080/swagger/index.html 查看文档"

# Install swagger tool
install-swagger:
	go install github.com/swaggo/swag/cmd/swag@latest

# Format code
fmt:
	go fmt ./...

# Lint code
lint:
	golangci-lint run

# Install dependencies
deps:
	go mod download

# Build for production
# google.golang.org/protobuf/reflect/protoregistry.conflictPolicy=warn for qdrant milvus proto conflict
build-prod:
	VERSION=$$(git describe --tags --abbrev=0 2>/dev/null || echo "$${VERSION:-unknown}"); \
	COMMIT_ID=$${COMMIT_ID:-unknown}; \
	CGO_ENABLED=1 \
	CGO_CFLAGS="$(CGO_OPT_CFLAGS)" \
	CGO_LDFLAGS="-Wl,-no_warn_duplicate_libraries" \
	BUILD_TIME=$${BUILD_TIME:-unknown}; \
	GO_VERSION=$${GO_VERSION:-unknown}; \
	LDFLAGS="-X 'github.com/Tencent/WeKnora/internal/handler.Version=$$VERSION' -X 'github.com/Tencent/WeKnora/internal/handler.Edition=standard' -X 'github.com/Tencent/WeKnora/internal/handler.CommitID=$$COMMIT_ID' -X 'github.com/Tencent/WeKnora/internal/handler.BuildTime=$$BUILD_TIME' -X 'github.com/Tencent/WeKnora/internal/handler.GoVersion=$$GO_VERSION' -X 'google.golang.org/protobuf/reflect/protoregistry.conflictPolicy=warn'"; \
	go build -ldflags="-w -s $$LDFLAGS" -o $(BINARY_NAME) $(MAIN_PATH)

download_spatial:
	go run cmd/download/duckdb/duckdb.go

clean-db:
	@echo "Cleaning database..."
	@if [ $$(docker volume ls -q -f name=weknora_postgres-data) ]; then \
		docker volume rm weknora_postgres-data; \
	fi
	@if [ $$(docker volume ls -q -f name=weknora_minio_data) ]; then \
		docker volume rm weknora_minio_data; \
	fi
	@if [ $$(docker volume ls -q -f name=weknora_redis_data) ]; then \
		docker volume rm weknora_redis_data; \
	fi

# Environment check
check-env:
	./scripts/start_all.sh --check

# List containers
list-containers:
	./scripts/start_all.sh --list

# Pull latest images
pull-images:
	./scripts/start_all.sh --pull

# Show current platform
show-platform:
	@echo "当前系统架构: $(shell uname -m)"
	@echo "Docker构建平台: $(PLATFORM)"

# Development mode commands
dev-start:
	./scripts/dev.sh start

dev-stop:
	./scripts/dev.sh stop

dev-restart:
	./scripts/dev.sh restart

dev-logs:
	./scripts/dev.sh logs

dev-status:
	./scripts/dev.sh status

dev-app:
	./scripts/dev.sh app

dev-frontend:
	./scripts/dev.sh frontend


