const ExcelIcon = ({ size = "18px", handleClick }) => {
  return (
    <svg
      width={size}
      height={size}
      onClick={handleClick}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 2v6h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="6.5"
        y="11"
        width="11"
        height="8.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M10.5 11v8.5M14.5 11v8.5M6.5 14.25h11M6.5 17h11"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default ExcelIcon;
