<?php

namespace App\Services;

use DOMDocument;
use DOMElement;
use DOMNode;

class ArticleHtml
{
    public static function sanitize(string $html): string
    {
        $document = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        try {
            $document->loadHTML('<?xml encoding="utf-8" ?><div id="article-content">'.$html.'</div>', LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
            $root = $document->getElementById('article-content');
            if (! $root) {
                return '';
            }
            self::clean($root);

            return implode('', array_map(fn ($node) => $document->saveHTML($node), iterator_to_array($root->childNodes)));
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    private static function clean(DOMNode $parent): void
    {
        foreach (iterator_to_array($parent->childNodes) as $node) {
            if (! $node instanceof DOMElement) {
                continue;
            }
            $tag = strtolower($node->tagName);
            if (in_array($tag, ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'link', 'meta'], true)) {
                $parent->removeChild($node);

                continue;
            }
            self::clean($node);
            if (! in_array($tag, ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'a', 'h1', 'h2', 'h3', 'h4', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'pre', 'code', 'hr'], true)) {
                while ($node->firstChild) {
                    $parent->insertBefore($node->firstChild, $node);
                }
                $parent->removeChild($node);

                continue;
            }
            $href = $tag === 'a' ? trim($node->getAttribute('href')) : '';
            foreach (iterator_to_array($node->attributes) as $attribute) {
                $node->removeAttribute($attribute->name);
            }
            if ($href !== '' && (str_starts_with($href, '#') || in_array(strtolower(parse_url($href, PHP_URL_SCHEME) ?? ''), ['http', 'https', 'mailto'], true))) {
                $node->setAttribute('href', $href);
                $node->setAttribute('rel', 'noopener noreferrer');
            }
        }
    }
}
