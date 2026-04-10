package service

import "testing"

func TestStripMarkdownHTMLFence(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in, want string
	}{
		{"", ""},
		{"<!DOCTYPE html><html></html>", "<!DOCTYPE html><html></html>"},
		{"```html\n<!DOCTYPE html>\n```", "<!DOCTYPE html>"},
		{"```\n<p>x</p>\n```", "<p>x</p>"},
	}
	for _, tc := range cases {
		got := stripMarkdownHTMLFence(tc.in)
		if got != tc.want {
			t.Errorf("stripMarkdownHTMLFence(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
