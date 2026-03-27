import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Box, Text } from '@chakra-ui/react';

interface MarkdownContentProps {
  children: string;
  fontSize?: string;
  color?: string;
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({
  children,
  fontSize = 'md',
  color = 'gray.200',
}) => {
  return (
    <Box
      className="markdown-content"
      color={color}
      fontSize={fontSize}
      lineHeight="tall"
      sx={{
        'h1, h2, h3, h4': {
          fontWeight: 'semibold',
          mt: 4,
          mb: 2,
          color: 'white',
        },
        h1: { fontSize: '2xl' },
        h2: { fontSize: 'xl' },
        h3: { fontSize: 'lg' },
        h4: { fontSize: 'md' },
        p: { mb: 3 },
        'ul, ol': { pl: 5, mb: 3 },
        li: { mb: 1 },
        strong: { color: 'white', fontWeight: 'semibold' },
        em: { fontStyle: 'italic' },
        code: {
          bg: 'gray.700',
          color: 'purple.300',
          px: 1,
          py: 0.5,
          borderRadius: 'sm',
          fontSize: 'sm',
          fontFamily: 'mono',
        },
        pre: {
          bg: 'gray.700',
          p: 3,
          borderRadius: 'md',
          overflowX: 'auto',
          mb: 3,
          fontSize: 'sm',
          fontFamily: 'mono',
        },
        'pre code': {
          bg: 'transparent',
          p: 0,
          color: 'gray.100',
        },
        blockquote: {
          borderLeft: '3px solid',
          borderColor: 'purple.500',
          pl: 4,
          py: 1,
          mb: 3,
          color: 'gray.400',
          fontStyle: 'italic',
        },
        hr: { borderColor: 'gray.600', my: 4 },
        'p:last-child': { mb: 0 },
      }}
    >
      <ReactMarkdown>{children}</ReactMarkdown>
    </Box>
  );
};

export default MarkdownContent;
