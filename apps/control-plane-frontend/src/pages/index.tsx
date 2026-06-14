import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/probes',
    permanent: false,
  },
});

export default function HomePage() {
  return null;
}
