import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Box } from '@chakra-ui/react';

interface MarkdownContentProps {
  children: string;
  fontSize?: string;
  color?: string;
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({
  children,
  fontSize = 'md',
  color = 'fg.muted',
}) => {
  return (
    <Box
      className="markdown-content"
      color={color}
      fontSize={fontSize}
      lineHeight="tall"
      css={{
        '& h1, & h2, & h3, & h4': {
          fontWeight: 'semibold',
          mt: 4,
          mb: 2,
          color: 'fg.default',
        },
        '& h1': { fontSize: '2xl' },
        '& h2': { fontSize: 'xl' },
        '& h3': { fontSize: 'lg' },
        '& h4': { fontSize: 'md' },
        '& p': { mb: 3 },
        '& ul, & ol': { pl: 5, mb: 3 },
        '& li': { mb: 1 },
        '& strong': { color: 'fg.default', fontWeight: 'semibold' },
        '& em': { fontStyle: 'italic' },
        '& code': {
          bg: 'bg.inset',
          color: 'accent.fg',
          px: 1,
          py: 0.5,
          borderRadius: 'sm',
          fontSize: 'sm',
          fontFamily: 'mono',
        },
        '& pre': {
          bg: 'bg.inset',
          border: '1px solid',
          borderColor: 'border.subtle',
          p: 3,
          borderRadius: 'md',
          overflowX: 'auto',
          mb: 3,
          fontSize: 'sm',
          fontFamily: 'mono',
        },
        '& pre code': {
          bg: 'transparent',
          p: 0,
          color: 'fg.default',
        },
        '& blockquote': {
          borderLeft: '3px solid',
          borderColor: 'accent.solid',
          pl: 4,
          py: 1,
          mb: 3,
          color: 'fg.muted',
          fontStyle: 'italic',
        },
        '& hr': { borderColor: 'border.subtle', my: 4 },
        '& p:last-child': { mb: 0 },
      }}
    >
      <ReactMarkdown>{children}</ReactMarkdown>
    </Box>
  );
};

export default MarkdownContent;
