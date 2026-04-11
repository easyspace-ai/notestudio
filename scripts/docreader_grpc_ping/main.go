// docreader_grpc_ping: 与主程序相同的 gRPC 拨号方式，调用 ListEngines 做连通性探测。
// 用法: go run ./scripts/docreader_grpc_ping/ [host:port]
// 默认: localhost:5410
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/Tencent/WeKnora/docreader/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/resolver"
)

func main() {
	addr := "localhost:5410"
	if len(os.Args) > 1 {
		addr = os.Args[1]
	}

	// 与 internal/infrastructure/docparser/grpc_parser.go 一致
	resolver.SetDefaultScheme("dns")
	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithDefaultServiceConfig(`{"loadBalancingPolicy":"round_robin"}`),
	}
	conn, err := grpc.Dial("dns:///"+addr, opts...)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[FAIL] dial: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	cli := proto.NewDocReaderClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	resp, err := cli.ListEngines(ctx, &proto.ListEnginesRequest{})
	if err != nil {
		fmt.Fprintf(os.Stderr, "[FAIL] ListEngines: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("[OK] docreader at %s — ListEngines returned %d engine(s)\n", addr, len(resp.GetEngines()))
	for _, e := range resp.GetEngines() {
		fmt.Printf("     %q available=%v types=%v\n", e.GetName(), e.GetAvailable(), e.GetFileTypes())
	}
}
