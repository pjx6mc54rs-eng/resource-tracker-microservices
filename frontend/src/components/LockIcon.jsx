const LockIcon = ({ size = "20px", handleClick }) => {
  return (
    <svg
      width={size}
      height={size}
      onClick={handleClick}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="4.5"
        y="10.5"
        width="15"
        height="10.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 10.5V7.5a4.5 4.5 0 019 0v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default LockIcon;
