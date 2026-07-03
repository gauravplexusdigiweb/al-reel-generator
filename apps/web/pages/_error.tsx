import type { NextPageContext } from 'next';
import NextErrorComponent from 'next/error';

function CustomError({ statusCode }: { statusCode: number }) {
  return <NextErrorComponent statusCode={statusCode} />;
}

CustomError.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode ?? 500 : 404;
  return { statusCode };
};

export default CustomError;